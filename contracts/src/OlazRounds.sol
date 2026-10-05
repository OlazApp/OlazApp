// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IUniswapV3PoolOracle {
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IAggregatorV3 {
    function getRoundData(uint80 roundId)
        external
        view
        returns (uint80 roundId_, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/**
 * @title OlazRounds
 * @notice Parimutuel UP/DOWN rounds on Robinhood Chain, paid in ETH.
 *
 * Every market is one asset at one round length. Round `r` of a market with
 * length `d` runs from `r * d` to `(r + 1) * d` (unix seconds, so rounds line
 * up with the clock). Positions for round `r` are taken while round `r - 1`
 * is live and stop exactly when round `r` starts, so nobody can enter after
 * its lock price is fixed.
 *
 * After a round ends anyone may settle it. The contract reads both prices
 * itself and nobody can pick the result:
 *  - Pool markets use the Uniswap v3 oracle (observe) over the 60 seconds
 *    before each boundary. A token's USD move is its WETH pool move plus the
 *    WETH/USDG pool move, so the comparison is done on summed tick
 *    cumulatives (log price) and needs no price maths.
 *  - Feed markets use a Chainlink aggregator. The caller passes the round id
 *    that was current at each boundary and the contract proves it (its update
 *    is at or before the boundary, the next update is after it, or it is
 *    still the latest). A price older than the market's max age refunds.
 *
 * The pot is split pro rata among the winning side after a 3% fee. Rounds
 * refund in full, without fee, when the close equals the lock, when one side
 * is empty, when a feed is stale, or when the pool history no longer reaches
 * the round a day after it ended. A round nobody could settle for seven days
 * can be voided by anyone, so stakes can never be stuck.
 *
 * There is no owner. Markets, fee, limits and the fee recipient are fixed at
 * deployment.
 */
contract OlazRounds {
    enum Kind {
        None,
        EthPool, // WETH priced from the WETH/USD pool
        TokenPool, // token priced from its WETH pool, converted with the WETH/USD pool
        Feed // Chainlink aggregator
    }

    enum Side {
        None,
        Up,
        Down
    }

    enum Outcome {
        Open,
        Up,
        Down,
        Refund
    }

    struct MarketConfig {
        bytes32 label; // "eth-5m"
        Kind kind;
        address source; // token pool or feed; unused for EthPool
        bool tokenIsToken0; // TokenPool only
        uint32 duration; // seconds
        uint32 maxAge; // Feed only: oldest acceptable price, in seconds
        uint128 maxPot; // cap on the total staked in one round
    }

    struct Round {
        uint128 up;
        uint128 down;
        int128 lockValue;
        int128 closeValue;
        Outcome outcome;
    }

    struct Position {
        Side side;
        bool claimed;
        uint128 stake;
    }

    /// One row of a wallet's history, joined with its round.
    struct Entry {
        uint256 key;
        Side side;
        bool claimed;
        uint128 stake;
        uint128 up;
        uint128 down;
        Outcome outcome;
        int128 lockValue;
        int128 closeValue;
        uint256 payout;
    }

    uint256 public constant FEE_BPS = 300;
    uint256 public constant MIN_STAKE = 0.0005 ether;
    uint256 public constant MAX_STAKE = 0.25 ether;
    uint32 public constant TWAP_SECONDS = 60;
    uint256 public constant POOL_GRACE = 1 days;
    uint256 public constant VOID_AFTER = 7 days;

    address public immutable TREASURY;
    address public immutable WETH;
    address public immutable ETH_USD_POOL;
    bool public immutable WETH_IS_TOKEN0;

    MarketConfig[] private _markets;
    mapping(uint256 key => Round) private _rounds;
    mapping(address user => mapping(uint256 key => Position)) private _positions;
    mapping(address user => uint256[]) private _userKeys;

    uint256 public feesAccrued;
    uint256 private _lock = 1;

    event Entered(address indexed user, uint256 indexed market, uint64 indexed round, Side side, uint256 amount);
    event Settled(uint256 indexed market, uint64 indexed round, Outcome outcome, int128 lockValue, int128 closeValue, uint256 fee);
    event Claimed(address indexed user, uint256 amount, uint256 positions);
    event FeesWithdrawn(address indexed to, uint256 amount);

    error BadConfig();
    error UnknownMarket();
    error NotOpen();
    error BadStake();
    error BadSide();
    error PotFull();
    error NotEnded();
    error AlreadySettled();
    error NothingStaked();
    error PriceUnavailable();
    error BadHint();
    error NotClaimable();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address treasury, address weth, address ethUsdPool, MarketConfig[] memory markets_) {
        if (treasury == address(0) || weth == address(0) || ethUsdPool.code.length == 0) revert BadConfig();
        if (markets_.length == 0 || markets_.length > 64) revert BadConfig();
        address t0 = IUniswapV3PoolOracle(ethUsdPool).token0();
        address t1 = IUniswapV3PoolOracle(ethUsdPool).token1();
        if (t0 != weth && t1 != weth) revert BadConfig();
        TREASURY = treasury;
        WETH = weth;
        ETH_USD_POOL = ethUsdPool;
        WETH_IS_TOKEN0 = t0 == weth;

        for (uint256 i; i < markets_.length; ++i) {
            MarketConfig memory m = markets_[i];
            if (m.duration < 60 || m.duration > 1 days || m.maxPot == 0 || m.label == bytes32(0)) revert BadConfig();
            if (m.kind == Kind.TokenPool) {
                if (m.source.code.length == 0) revert BadConfig();
                address other = m.tokenIsToken0
                    ? IUniswapV3PoolOracle(m.source).token1()
                    : IUniswapV3PoolOracle(m.source).token0();
                if (other != weth) revert BadConfig();
            } else if (m.kind == Kind.Feed) {
                if (m.source.code.length == 0 || m.maxAge == 0) revert BadConfig();
            } else if (m.kind != Kind.EthPool) {
                revert BadConfig();
            }
            _markets.push(m);
        }
    }

    // ---------------------------------------------------------------- entry

    /// @notice Stake msg.value on `side` in round `round` of market `market`.
    /// One side per wallet per round; adding to the same side is allowed.
    function enter(uint256 market, uint64 round, Side side) external payable nonReentrant {
        MarketConfig storage m = _market(market);
        uint256 start = uint256(round) * m.duration;
        if (block.timestamp >= start || block.timestamp + m.duration < start) revert NotOpen();
        if (msg.value < MIN_STAKE || msg.value > MAX_STAKE) revert BadStake();
        if (side != Side.Up && side != Side.Down) revert BadSide();

        uint256 key = keyOf(market, round);
        Position storage p = _positions[msg.sender][key];
        if (p.side == Side.None) {
            p.side = side;
            _userKeys[msg.sender].push(key);
        } else if (p.side != side) {
            revert BadSide();
        }
        p.stake += uint128(msg.value);

        Round storage r = _rounds[key];
        if (side == Side.Up) r.up += uint128(msg.value);
        else r.down += uint128(msg.value);
        if (uint256(r.up) + r.down > m.maxPot) revert PotFull();

        emit Entered(msg.sender, market, round, side, msg.value);
    }

    // ----------------------------------------------------------- settlement

    /// @notice Settle a round. Hints are Chainlink round ids for feed markets
    /// (the round current at the start and at the end); pool markets ignore them.
    function settle(uint256 market, uint64 round, uint80 lockHint, uint80 closeHint) external {
        MarketConfig storage m = _market(market);
        uint256 key = keyOf(market, round);
        Round storage r = _rounds[key];
        if (r.outcome != Outcome.Open) revert AlreadySettled();
        if (r.up == 0 && r.down == 0) revert NothingStaked();

        uint256 start = uint256(round) * m.duration;
        uint256 end = start + m.duration;

        // A one-sided round is a refund whatever the price does; no need to wait.
        if (r.up == 0 || r.down == 0) {
            if (block.timestamp < start) revert NotEnded();
            _finish(market, round, r, Outcome.Refund, 0, 0);
            return;
        }
        if (block.timestamp < end) revert NotEnded();

        bool ok;
        bool valid;
        int256 lockV;
        int256 closeV;
        if (m.kind == Kind.Feed) {
            ok = true;
            bool v1;
            bool v2;
            (v1, lockV) = _feedAt(m.source, m.maxAge, start, lockHint);
            (v2, closeV) = _feedAt(m.source, m.maxAge, end, closeHint);
            valid = v1 && v2;
        } else {
            (ok, lockV, closeV) = _poolValues(m, start, end);
            valid = ok;
        }

        if (!ok) {
            // Pool history did not reach the round. Keep trying for a day, then refund.
            if (block.timestamp <= end + POOL_GRACE) revert PriceUnavailable();
            _finish(market, round, r, Outcome.Refund, 0, 0);
            return;
        }
        if (!valid) {
            _finish(market, round, r, Outcome.Refund, int128(lockV), int128(closeV));
            return;
        }

        // Values fit in int128: tick sums are below 2^32 and feed answers are capped in _feedAt.
        Outcome outcome = closeV > lockV ? Outcome.Up : closeV < lockV ? Outcome.Down : Outcome.Refund;
        _finish(market, round, r, outcome, int128(lockV), int128(closeV));
    }

    /// @notice Escape hatch: refund a round nobody managed to settle for seven days.
    function voidRound(uint256 market, uint64 round) external {
        MarketConfig storage m = _market(market);
        uint256 key = keyOf(market, round);
        Round storage r = _rounds[key];
        if (r.outcome != Outcome.Open) revert AlreadySettled();
        if (block.timestamp <= (uint256(round) + 1) * m.duration + VOID_AFTER) revert NotEnded();
        _finish(market, round, r, Outcome.Refund, 0, 0);
    }

    function _finish(uint256 market, uint64 round, Round storage r, Outcome outcome, int128 lockV, int128 closeV) private {
        r.outcome = outcome;
        r.lockValue = lockV;
        r.closeValue = closeV;
        uint256 fee;
        if (outcome == Outcome.Up || outcome == Outcome.Down) {
            fee = ((uint256(r.up) + r.down) * FEE_BPS) / 10_000;
            feesAccrued += fee;
        }
        emit Settled(market, round, outcome, lockV, closeV, fee);
    }

    // ---------------------------------------------------------------- claims

    /// @notice Collect winnings and refunds of settled rounds in one transfer.
    function claim(uint256[] calldata keys) external nonReentrant {
        uint256 total;
        for (uint256 i; i < keys.length; ++i) {
            Position storage p = _positions[msg.sender][keys[i]];
            Round storage r = _rounds[keys[i]];
            if (p.stake == 0 || p.claimed || r.outcome == Outcome.Open) revert NotClaimable();
            p.claimed = true;
            total += _payout(p, r);
        }
        emit Claimed(msg.sender, total, keys.length);
        if (total > 0) _send(msg.sender, total);
    }

    /// @notice Sends accrued fees to the fixed treasury. Anyone may call.
    function withdrawFees() external nonReentrant {
        uint256 amount = feesAccrued;
        feesAccrued = 0;
        emit FeesWithdrawn(TREASURY, amount);
        if (amount > 0) _send(TREASURY, amount);
    }

    function _payout(Position storage p, Round storage r) private view returns (uint256) {
        if (r.outcome == Outcome.Refund) return p.stake;
        if (r.outcome == Outcome.Open) return 0;
        Side winner = r.outcome == Outcome.Up ? Side.Up : Side.Down;
        if (p.side != winner) return 0;
        uint256 pot = uint256(r.up) + r.down;
        uint256 net = pot - (pot * FEE_BPS) / 10_000;
        uint256 winning = winner == Side.Up ? r.up : r.down;
        return (uint256(p.stake) * net) / winning;
    }

    function _send(address to, uint256 amount) private {
        (bool sent,) = to.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    // --------------------------------------------------------------- oracles

    /// Summed 60-second tick cumulatives (log price, in 1/60 ticks) at both boundaries.
    function _poolValues(MarketConfig storage m, uint256 start, uint256 end)
        private
        view
        returns (bool ok, int256 lockV, int256 closeV)
    {
        // Both boundaries are in the past and settlement happens within days, so the ages fit in uint32.
        uint32[] memory ago = new uint32[](4);
        ago[0] = uint32(block.timestamp - start) + TWAP_SECONDS;
        ago[1] = uint32(block.timestamp - start);
        ago[2] = uint32(block.timestamp - end) + TWAP_SECONDS;
        ago[3] = uint32(block.timestamp - end);

        int256 a;
        int256 b;
        (ok, a, b) = _twap(ETH_USD_POOL, ago);
        if (!ok) return (false, 0, 0);
        int256 sign = WETH_IS_TOKEN0 ? int256(1) : int256(-1);
        lockV = sign * a;
        closeV = sign * b;

        if (m.kind == Kind.TokenPool) {
            (ok, a, b) = _twap(m.source, ago);
            if (!ok) return (false, 0, 0);
            sign = m.tokenIsToken0 ? int256(1) : int256(-1);
            lockV += sign * a;
            closeV += sign * b;
        }
    }

    function _twap(address pool, uint32[] memory ago) private view returns (bool ok, int256 a, int256 b) {
        try IUniswapV3PoolOracle(pool).observe(ago) returns (int56[] memory c, uint160[] memory) {
            if (c.length != 4) return (false, 0, 0);
            return (true, int256(c[1]) - c[0], int256(c[3]) - c[2]);
        } catch {
            return (false, 0, 0);
        }
    }

    /// Price of a Chainlink feed at time `t`, given the round id that was current then.
    /// Reverts when the hint is not that round; returns valid = false for stale or bad answers.
    function _feedAt(address feed, uint32 maxAge, uint256 t, uint80 hint)
        private
        view
        returns (bool valid, int256 answer)
    {
        uint256 updatedAt;
        try IAggregatorV3(feed).getRoundData(hint) returns (uint80, int256 a, uint256, uint256 u, uint80) {
            answer = a;
            updatedAt = u;
        } catch {
            revert BadHint();
        }
        if (updatedAt == 0 || updatedAt > t) revert BadHint();

        bool hasNext;
        try IAggregatorV3(feed).getRoundData(hint + 1) returns (uint80, int256, uint256, uint256 u2, uint80) {
            if (u2 != 0) {
                if (u2 <= t) revert BadHint();
                hasNext = true;
            }
        } catch {}
        if (!hasNext) {
            (uint80 latest,,,,) = IAggregatorV3(feed).latestRoundData();
            if (latest != hint) revert BadHint();
        }

        if (answer <= 0 || answer > type(int128).max || t - updatedAt > maxAge) return (false, 0);
        return (true, answer);
    }

    // ----------------------------------------------------------------- views

    function keyOf(uint256 market, uint64 round) public pure returns (uint256) {
        return (market << 64) | round;
    }

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function marketConfig(uint256 index) external view returns (MarketConfig memory) {
        return _market(index);
    }

    function getRound(uint256 market, uint64 round) external view returns (Round memory) {
        return _rounds[keyOf(market, round)];
    }

    function getRounds(uint256[] calldata keys) external view returns (Round[] memory out) {
        out = new Round[](keys.length);
        for (uint256 i; i < keys.length; ++i) out[i] = _rounds[keys[i]];
    }

    function positionOf(address user, uint256 key) external view returns (Position memory) {
        return _positions[user][key];
    }

    function entryCount(address user) external view returns (uint256) {
        return _userKeys[user].length;
    }

    /// Newest first: `offset` 0 is the latest round the wallet entered.
    function entries(address user, uint256 offset, uint256 limit) external view returns (Entry[] memory out) {
        uint256[] storage keys = _userKeys[user];
        uint256 n = keys.length;
        if (offset >= n) return new Entry[](0);
        uint256 count = n - offset < limit ? n - offset : limit;
        out = new Entry[](count);
        for (uint256 i; i < count; ++i) {
            uint256 key = keys[n - 1 - offset - i];
            Position storage p = _positions[user][key];
            Round storage r = _rounds[key];
            out[i] = Entry({
                key: key,
                side: p.side,
                claimed: p.claimed,
                stake: p.stake,
                up: r.up,
                down: r.down,
                outcome: r.outcome,
                lockValue: r.lockValue,
                closeValue: r.closeValue,
                payout: _payout(p, r)
            });
        }
    }

    function _market(uint256 index) private view returns (MarketConfig storage) {
        if (index >= _markets.length) revert UnknownMarket();
        return _markets[index];
    }
}
