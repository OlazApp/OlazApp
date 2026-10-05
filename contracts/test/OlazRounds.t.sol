// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {OlazRounds} from "../src/OlazRounds.sol";
import {MockPool, MockFeed, Token} from "./Mocks.sol";

contract Reenter {
    OlazRounds immutable game;
    uint256[] keys;
    bool armed;

    constructor(OlazRounds g) {
        game = g;
    }

    function enter(uint256 m, uint64 r, OlazRounds.Side s) external payable {
        game.enter{value: msg.value}(m, r, s);
        keys.push(game.keyOf(m, r));
    }

    function claimAll() external {
        armed = true;
        game.claim(keys);
    }

    receive() external payable {
        if (armed) {
            armed = false;
            game.claim(keys); // must fail: nonReentrant + already claimed
        }
    }
}

contract OlazRoundsTest is Test {
    OlazRounds game;
    MockPool ethPool;
    MockPool tokenPool;
    MockFeed feed;
    address weth;
    address usd;
    address token;
    address treasury = address(0xFEE);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA201);

    uint256 constant ETH5 = 0;
    uint256 constant TOKEN5 = 1;
    uint256 constant FEED1H = 2;

    function setUp() public {
        vm.warp(1_800_000_000); // aligned to 5 minutes and 1 hour
        weth = address(new Token());
        usd = address(new Token());
        token = address(new Token());
        ethPool = new MockPool(weth, usd, 1000); // WETH is token0
        tokenPool = new MockPool(weth, token, 500); // token is token1
        feed = new MockFeed(100);
        feed.push(100e8, block.timestamp - 10);

        OlazRounds.MarketConfig[] memory ms = new OlazRounds.MarketConfig[](3);
        ms[0] = OlazRounds.MarketConfig("eth-5m", OlazRounds.Kind.EthPool, address(0), false, 300, 0, 10 ether);
        ms[1] = OlazRounds.MarketConfig("tok-5m", OlazRounds.Kind.TokenPool, address(tokenPool), false, 300, 0, 1 ether);
        ms[2] = OlazRounds.MarketConfig("stk-1h", OlazRounds.Kind.Feed, address(feed), false, 3600, 4 hours, 5 ether);
        game = new OlazRounds(treasury, weth, address(ethPool), ms);

        for (uint256 i; i < 3; ++i) vm.deal([alice, bob, carol][i], 100 ether);
    }

    function nextRound(uint256 d) internal view returns (uint64) {
        return uint64(block.timestamp / d + 1);
    }

    // ------------------------------------------------------------- entering

    function test_entryWindow() public {
        uint64 r = nextRound(300);
        vm.prank(alice);
        game.enter{value: 0.01 ether}(ETH5, r, OlazRounds.Side.Up);

        // Two rounds ahead is not open yet.
        vm.prank(alice);
        vm.expectRevert(OlazRounds.NotOpen.selector);
        game.enter{value: 0.01 ether}(ETH5, r + 1, OlazRounds.Side.Up);

        // At the start boundary it is closed.
        vm.warp(uint256(r) * 300);
        vm.prank(bob);
        vm.expectRevert(OlazRounds.NotOpen.selector);
        game.enter{value: 0.01 ether}(ETH5, r, OlazRounds.Side.Down);

        // One second before it was still open.
        vm.warp(uint256(r) * 300 - 1);
        vm.prank(bob);
        game.enter{value: 0.01 ether}(ETH5, r, OlazRounds.Side.Down);
    }

    function test_stakeLimitsAndSides() public {
        uint64 r = nextRound(300);
        vm.startPrank(alice);
        vm.expectRevert(OlazRounds.BadStake.selector);
        game.enter{value: 0.0004 ether}(ETH5, r, OlazRounds.Side.Up);
        vm.expectRevert(OlazRounds.BadStake.selector);
        game.enter{value: 0.26 ether}(ETH5, r, OlazRounds.Side.Up);
        vm.expectRevert(OlazRounds.BadSide.selector);
        game.enter{value: 0.01 ether}(ETH5, r, OlazRounds.Side.None);

        game.enter{value: 0.01 ether}(ETH5, r, OlazRounds.Side.Up);
        game.enter{value: 0.02 ether}(ETH5, r, OlazRounds.Side.Up);
        vm.expectRevert(OlazRounds.BadSide.selector);
        game.enter{value: 0.01 ether}(ETH5, r, OlazRounds.Side.Down);
        vm.stopPrank();

        OlazRounds.Position memory p = game.positionOf(alice, game.keyOf(ETH5, r));
        assertEq(p.stake, 0.03 ether);
        assertEq(game.entryCount(alice), 1);
        assertEq(game.getRound(ETH5, r).up, 0.03 ether);
    }

    function test_potCap() public {
        uint64 r = nextRound(300);
        for (uint256 i; i < 4; ++i) {
            vm.deal(address(uint160(1000 + i)), 1 ether);
            vm.prank(address(uint160(1000 + i)));
            game.enter{value: 0.25 ether}(TOKEN5, r, OlazRounds.Side.Up);
        }
        vm.prank(alice);
        vm.expectRevert(OlazRounds.PotFull.selector);
        game.enter{value: 0.0005 ether}(TOKEN5, r, OlazRounds.Side.Down);
    }

    function test_unknownMarket() public {
        vm.prank(alice);
        vm.expectRevert(OlazRounds.UnknownMarket.selector);
        game.enter{value: 0.01 ether}(9, 1, OlazRounds.Side.Up);
    }

    // ------------------------------------------------------- pool settlement

    function _bet(uint256 m, uint64 r, address who, OlazRounds.Side s, uint256 v) internal {
        vm.prank(who);
        game.enter{value: v}(m, r, s);
    }

    function test_ethRoundUpPaysWinners() public {
        uint64 r = nextRound(300);
        _bet(ETH5, r, alice, OlazRounds.Side.Up, 0.1 ether);
        _bet(ETH5, r, carol, OlazRounds.Side.Up, 0.1 ether);
        _bet(ETH5, r, bob, OlazRounds.Side.Down, 0.2 ether);

        uint256 start = uint256(r) * 300;
        vm.warp(start + 100);
        ethPool.setTick(1010); // price rises during the round
        vm.warp(start + 299);
        vm.expectRevert(OlazRounds.NotEnded.selector);
        game.settle(ETH5, r, 0, 0);
        vm.warp(start + 300);
        game.settle(ETH5, r, 0, 0);

        OlazRounds.Round memory round = game.getRound(ETH5, r);
        assertEq(uint8(round.outcome), uint8(OlazRounds.Outcome.Up));
        assertEq(round.lockValue, 1000 * 60);
        assertEq(round.closeValue, 1010 * 60);
        assertEq(game.feesAccrued(), 0.012 ether);

        uint256[] memory keys = new uint256[](1);
        keys[0] = game.keyOf(ETH5, r);
        uint256 before = alice.balance;
        vm.prank(alice);
        game.claim(keys);
        assertEq(alice.balance - before, 0.194 ether); // 0.1 / 0.2 of 0.388

        before = bob.balance;
        vm.prank(bob);
        game.claim(keys);
        assertEq(bob.balance, before); // lost

        vm.prank(alice);
        vm.expectRevert(OlazRounds.NotClaimable.selector);
        game.claim(keys);

        vm.prank(carol);
        game.claim(keys);
        game.withdrawFees();
        assertEq(treasury.balance, 0.012 ether);
        assertEq(address(game).balance, 0);
    }

    function test_tieRefundsWithoutFee() public {
        uint64 r = nextRound(300);
        _bet(ETH5, r, alice, OlazRounds.Side.Up, 0.1 ether);
        _bet(ETH5, r, bob, OlazRounds.Side.Down, 0.05 ether);
        vm.warp(uint256(r) * 300 + 300);
        game.settle(ETH5, r, 0, 0);
        assertEq(uint8(game.getRound(ETH5, r).outcome), uint8(OlazRounds.Outcome.Refund));
        assertEq(game.feesAccrued(), 0);
        uint256[] memory keys = new uint256[](1);
        keys[0] = game.keyOf(ETH5, r);
        uint256 a = alice.balance;
        uint256 b = bob.balance;
        vm.prank(alice);
        game.claim(keys);
        vm.prank(bob);
        game.claim(keys);
        assertEq(alice.balance - a, 0.1 ether);
        assertEq(bob.balance - b, 0.05 ether);
    }

    function test_oneSidedRefundsAtLock() public {
        uint64 r = nextRound(300);
        _bet(ETH5, r, alice, OlazRounds.Side.Up, 0.1 ether);
        vm.expectRevert(OlazRounds.NotEnded.selector);
        game.settle(ETH5, r, 0, 0);
        vm.warp(uint256(r) * 300);
        game.settle(ETH5, r, 0, 0);
        assertEq(uint8(game.getRound(ETH5, r).outcome), uint8(OlazRounds.Outcome.Refund));
    }

    function test_emptyRoundCannotSettle() public {
        vm.warp(block.timestamp + 3600);
        vm.expectRevert(OlazRounds.NothingStaked.selector);
        game.settle(ETH5, uint64(block.timestamp / 300 - 2), 0, 0);
    }

    function test_tokenPoolCombinesWithEth() public {
        uint64 r = nextRound(300);
        _bet(TOKEN5, r, alice, OlazRounds.Side.Up, 0.1 ether);
        _bet(TOKEN5, r, bob, OlazRounds.Side.Down, 0.1 ether);
        uint256 start = uint256(r) * 300;
        vm.warp(start + 10);
        // Token is token1 of its WETH pool: the pool tick falling means the token gains vs WETH.
        tokenPool.setTick(480); // token +20 ticks vs WETH
        ethPool.setTick(970); // ETH -30 ticks vs USD
        vm.warp(start + 300);
        game.settle(TOKEN5, r, 0, 0);
        // USD move = +20 - 30 = -10 ticks: DOWN.
        assertEq(uint8(game.getRound(TOKEN5, r).outcome), uint8(OlazRounds.Outcome.Down));
    }

    function test_poolHistoryLostRefundsAfterGrace() public {
        uint64 r = nextRound(300);
        _bet(ETH5, r, alice, OlazRounds.Side.Up, 0.1 ether);
        _bet(ETH5, r, bob, OlazRounds.Side.Down, 0.1 ether);
        uint256 end = uint256(r) * 300 + 300;
        vm.warp(end + 2 hours);
        ethPool.setOldest(end); // the lock moment is no longer covered
        vm.expectRevert(OlazRounds.PriceUnavailable.selector);
        game.settle(ETH5, r, 0, 0);
        vm.warp(end + 1 days + 1);
        game.settle(ETH5, r, 0, 0);
        assertEq(uint8(game.getRound(ETH5, r).outcome), uint8(OlazRounds.Outcome.Refund));
    }

    // ------------------------------------------------------- feed settlement

    function _feedRound() internal returns (uint64 r, uint256 start, uint256 end) {
        r = nextRound(3600);
        _bet(FEED1H, r, alice, OlazRounds.Side.Up, 0.1 ether);
        _bet(FEED1H, r, bob, OlazRounds.Side.Down, 0.2 ether);
        start = uint256(r) * 3600;
        end = start + 3600;
    }

    function test_feedSettlesWithProvenHints() public {
        (uint64 r, uint256 start, uint256 end) = _feedRound();
        vm.warp(start - 100);
        uint80 lockId = feed.push(101e8, start - 100);
        vm.warp(start + 500);
        feed.push(102e8, start + 500);
        vm.warp(end - 5);
        uint80 closeId = feed.push(99e8, end - 5);
        vm.warp(end + 60);
        feed.push(98e8, end + 60);

        // Wrong hints are rejected, never used.
        vm.expectRevert(OlazRounds.BadHint.selector);
        game.settle(FEED1H, r, lockId + 1, closeId);
        vm.expectRevert(OlazRounds.BadHint.selector);
        game.settle(FEED1H, r, lockId - 1, closeId);
        vm.expectRevert(OlazRounds.BadHint.selector);
        game.settle(FEED1H, r, lockId, closeId + 1);
        vm.expectRevert(OlazRounds.BadHint.selector);
        game.settle(FEED1H, r, lockId, 999);

        game.settle(FEED1H, r, lockId, closeId);
        OlazRounds.Round memory round = game.getRound(FEED1H, r);
        assertEq(uint8(round.outcome), uint8(OlazRounds.Outcome.Down));
        assertEq(round.lockValue, 101e8);
        assertEq(round.closeValue, 99e8);
    }

    function test_feedLatestRoundCountsWhenNoNewerUpdate() public {
        (uint64 r, uint256 start, uint256 end) = _feedRound();
        vm.warp(start - 1);
        uint80 lockId = feed.push(100e8, start - 1);
        vm.warp(start + 1800);
        uint80 closeId = feed.push(105e8, start + 1800);
        vm.warp(end + 10);
        game.settle(FEED1H, r, lockId, closeId);
        assertEq(uint8(game.getRound(FEED1H, r).outcome), uint8(OlazRounds.Outcome.Up));
    }

    function test_feedMissingRoundsReturnZeroToo() public {
        feed.setRevertMissing(false);
        test_feedLatestRoundCountsWhenNoNewerUpdate();
    }

    function test_feedSilentRoundIsTieRefund() public {
        (uint64 r,, uint256 end) = _feedRound();
        // Only the round from setUp exists: same price at both ends.
        vm.warp(end + 10);
        game.settle(FEED1H, r, 100, 100);
        assertEq(uint8(game.getRound(FEED1H, r).outcome), uint8(OlazRounds.Outcome.Refund));
    }

    function test_feedOlderThanMaxAgeRefunds() public {
        vm.warp(block.timestamp + 6 hours);
        (uint64 r,, uint256 end) = _feedRound();
        vm.warp(end - 10);
        uint80 closeId = feed.push(130e8, end - 10);
        vm.warp(end + 10);
        game.settle(FEED1H, r, 100, closeId); // lock price is ~7h old
        OlazRounds.Round memory round = game.getRound(FEED1H, r);
        assertEq(uint8(round.outcome), uint8(OlazRounds.Outcome.Refund));
        assertEq(game.feesAccrued(), 0);
    }

    // ----------------------------------------------------------- escape hatch

    function test_voidAfterSevenDays() public {
        (uint64 r,, uint256 end) = _feedRound();
        vm.warp(end + 7 days);
        vm.expectRevert(OlazRounds.NotEnded.selector);
        game.voidRound(FEED1H, r);
        vm.warp(end + 7 days + 1);
        game.voidRound(FEED1H, r);
        assertEq(uint8(game.getRound(FEED1H, r).outcome), uint8(OlazRounds.Outcome.Refund));
        vm.expectRevert(OlazRounds.AlreadySettled.selector);
        game.settle(FEED1H, r, 100, 100);
    }

    // -------------------------------------------------------------- safety

    function test_reentrantClaimFails() public {
        Reenter evil = new Reenter(game);
        vm.deal(address(evil), 1 ether);
        uint64 r = nextRound(300);
        evil.enter{value: 0.1 ether}(ETH5, r, OlazRounds.Side.Up);
        vm.warp(uint256(r) * 300);
        game.settle(ETH5, r, 0, 0); // one-sided refund
        vm.expectRevert(OlazRounds.TransferFailed.selector);
        evil.claimAll();
        assertEq(address(game).balance, 0.1 ether);
    }

    function test_entriesNewestFirst() public {
        uint64 r = nextRound(300);
        _bet(ETH5, r, alice, OlazRounds.Side.Up, 0.01 ether);
        _bet(TOKEN5, r, alice, OlazRounds.Side.Down, 0.02 ether);
        _bet(FEED1H, nextRound(3600), alice, OlazRounds.Side.Up, 0.03 ether);
        OlazRounds.Entry[] memory e = game.entries(alice, 0, 10);
        assertEq(e.length, 3);
        assertEq(e[0].stake, 0.03 ether);
        assertEq(e[2].stake, 0.01 ether);
        e = game.entries(alice, 1, 1);
        assertEq(e.length, 1);
        assertEq(e[0].stake, 0.02 ether);
        assertEq(game.entries(alice, 5, 1).length, 0);
    }

    function test_constructorRejectsPoolWithoutWeth() public {
        MockPool bad = new MockPool(usd, token, 0);
        OlazRounds.MarketConfig[] memory ms = new OlazRounds.MarketConfig[](1);
        ms[0] = OlazRounds.MarketConfig("x", OlazRounds.Kind.TokenPool, address(bad), true, 300, 0, 1 ether);
        vm.expectRevert(OlazRounds.BadConfig.selector);
        new OlazRounds(treasury, weth, address(ethPool), ms);
        ms[0] = OlazRounds.MarketConfig("x", OlazRounds.Kind.None, address(0), true, 300, 0, 1 ether);
        vm.expectRevert(OlazRounds.BadConfig.selector);
        new OlazRounds(treasury, weth, address(ethPool), ms);
        vm.expectRevert(OlazRounds.BadConfig.selector);
        new OlazRounds(address(0), weth, address(ethPool), new OlazRounds.MarketConfig[](1));
    }

    function test_plainEthRejected() public {
        vm.prank(alice);
        (bool ok,) = address(game).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ------------------------------------------------------------- fuzzing

    /// Whatever the stakes, payouts plus the fee never exceed the pot.
    function testFuzz_solvent(uint96[6] memory stakes, bool[6] memory up, int24 move) public {
        move = int24(bound(move, -500, 500));
        uint64 r = nextRound(300);
        address[6] memory who;
        uint256 pot;
        for (uint256 i; i < 6; ++i) {
            who[i] = address(uint160(5000 + i));
            uint256 v = bound(stakes[i], 0.0005 ether, 0.25 ether);
            vm.deal(who[i], v);
            vm.prank(who[i]);
            game.enter{value: v}(ETH5, r, up[i] ? OlazRounds.Side.Up : OlazRounds.Side.Down);
            pot += v;
        }
        uint256 start = uint256(r) * 300;
        vm.warp(start + 1);
        ethPool.setTick(1000 + move);
        vm.warp(start + 300);
        game.settle(ETH5, r, 0, 0);

        uint256[] memory keys = new uint256[](1);
        keys[0] = game.keyOf(ETH5, r);
        uint256 paid;
        for (uint256 i; i < 6; ++i) {
            uint256 b = who[i].balance;
            vm.prank(who[i]);
            game.claim(keys);
            paid += who[i].balance - b;
        }
        game.withdrawFees();
        assertLe(paid + treasury.balance, pot);
        assertEq(address(game).balance, pot - paid - treasury.balance);
        assertLt(address(game).balance, 10); // only rounding dust remains
    }
}
