// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Uniswap v3 oracle stand-in: the tick is piecewise constant between checkpoints,
/// cumulatives are integrated exactly, and moments before `oldest` revert like "OLD".
contract MockPool {
    address public token0;
    address public token1;
    uint256 public oldest;

    uint256[] internal times;
    int24[] internal ticks;

    constructor(address t0, address t1, int24 tick) {
        token0 = t0;
        token1 = t1;
        oldest = block.timestamp;
        times.push(block.timestamp);
        ticks.push(tick);
    }

    /// The tick from `block.timestamp` on.
    function setTick(int24 tick) external {
        if (times[times.length - 1] == block.timestamp) {
            ticks[ticks.length - 1] = tick;
        } else {
            times.push(block.timestamp);
            ticks.push(tick);
        }
    }

    function setOldest(uint256 t) external {
        oldest = t;
    }

    function cumulativeAt(uint256 t) public view returns (int56 c) {
        for (uint256 i; i < times.length; ++i) {
            if (times[i] >= t) break;
            uint256 until = i + 1 < times.length && times[i + 1] < t ? times[i + 1] : t;
            c += int56(ticks[i]) * int56(int256(until - times[i]));
        }
    }

    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory c, uint160[] memory s) {
        c = new int56[](secondsAgos.length);
        s = new uint160[](secondsAgos.length);
        for (uint256 i; i < secondsAgos.length; ++i) {
            uint256 t = block.timestamp - secondsAgos[i];
            require(t >= oldest, "OLD");
            c[i] = cumulativeAt(t);
        }
    }
}

/// Chainlink proxy stand-in with explicit rounds.
contract MockFeed {
    struct R {
        int256 answer;
        uint256 updatedAt;
    }

    uint80 public firstId;
    R[] internal rounds;
    bool public revertMissing = true;

    constructor(uint80 first) {
        firstId = first;
    }

    function push(int256 answer, uint256 updatedAt) external returns (uint80 id) {
        rounds.push(R(answer, updatedAt));
        id = firstId + uint80(rounds.length - 1);
    }

    function setRevertMissing(bool v) external {
        revertMissing = v;
    }

    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80) {
        if (id < firstId || id - firstId >= rounds.length) {
            if (revertMissing) revert("No data present");
            return (id, 0, 0, 0, id);
        }
        R memory r = rounds[id - firstId];
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        uint80 id = firstId + uint80(rounds.length - 1);
        R memory r = rounds[rounds.length - 1];
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }
}

contract Token {}
