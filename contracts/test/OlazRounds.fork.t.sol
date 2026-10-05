// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {OlazRounds, IUniswapV3PoolOracle, IAggregatorV3} from "../src/OlazRounds.sol";

/// Runs against a Robinhood Chain mainnet fork with the exact constructor
/// arguments the site produces (test/fork-args.hex, from src/config/onchain.ts).
/// forge test --match-contract Fork --fork-url https://robinhood-rpc.publicnode.com
contract OlazRoundsForkTest is Test {
    OlazRounds game;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        if (block.chainid != 4663) {
            vm.skip(true);
            return;
        }
        bytes memory args = vm.parseBytes(string.concat("0x", vm.readFile("test/fork-args.hex")));
        address deployed;
        bytes memory code = abi.encodePacked(type(OlazRounds).creationCode, args);
        assembly {
            deployed := create(0, add(code, 0x20), mload(code))
        }
        require(deployed != address(0), "deploy failed");
        game = OlazRounds(deployed);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function test_marketsMatchSiteConfig() public view {
        assertEq(game.marketCount(), 19);
        assertEq(game.marketConfig(0).label, bytes32("eth-5m"));
        assertEq(game.marketConfig(18).label, bytes32("googl-1h"));
        assertTrue(game.WETH_IS_TOKEN0());
        assertEq(game.TREASURY(), address(0xfee5));
    }

    function test_poolHistoryReachesAnHourBack() public view {
        uint32[] memory ago = new uint32[](4);
        ago[0] = 2 hours + 60;
        ago[1] = 2 hours;
        ago[2] = 60;
        ago[3] = 0;
        for (uint256 i = 3; i < 15; i += 3) {
            IUniswapV3PoolOracle(game.marketConfig(i).source).observe(ago);
        }
        IUniswapV3PoolOracle(game.ETH_USD_POOL()).observe(ago);
    }

    function _play(uint256 index) internal returns (uint64 r, uint256 end) {
        OlazRounds.MarketConfig memory m = game.marketConfig(index);
        r = uint64(block.timestamp / m.duration + 1);
        vm.prank(alice);
        game.enter{value: 0.05 ether}(index, r, OlazRounds.Side.Up);
        vm.prank(bob);
        game.enter{value: 0.02 ether}(index, r, OlazRounds.Side.Down);
        end = (uint256(r) + 1) * m.duration;
        vm.warp(end + 1);
        vm.roll(block.number + 100);
    }

    function test_settlesEthAndTokenRoundsOnRealPools() public {
        for (uint256 index = 0; index < 15; index += 4) {
            (uint64 r,) = _play(index);
            game.settle(index, r, 0, 0);
            OlazRounds.Round memory round = game.getRound(index, r);
            assertTrue(round.outcome != OlazRounds.Outcome.Open);
            assertTrue(round.lockValue != 0);
        }
    }

    function test_settlesStockRoundOnRealFeed() public {
        (uint64 r,) = _play(15);
        (uint80 latest,,,,) = IAggregatorV3(game.marketConfig(15).source).latestRoundData();
        game.settle(15, r, latest, latest);
        // No new answer can land on a fork: same price at both ends (or stale) refunds.
        assertEq(uint8(game.getRound(15, r).outcome), uint8(OlazRounds.Outcome.Refund));

        uint256[] memory keys = new uint256[](1);
        keys[0] = game.keyOf(15, r);
        uint256 before = alice.balance;
        vm.prank(alice);
        game.claim(keys);
        assertEq(alice.balance - before, 0.05 ether);
    }

    function test_gas() public {
        OlazRounds.MarketConfig memory m = game.marketConfig(0);
        uint64 r = uint64(block.timestamp / m.duration + 1);
        vm.prank(alice);
        uint256 g = gasleft();
        game.enter{value: 0.05 ether}(0, r, OlazRounds.Side.Up);
        emit log_named_uint("enter (first) gas", g - gasleft());
        vm.prank(bob);
        game.enter{value: 0.05 ether}(0, r, OlazRounds.Side.Down);
        vm.warp((uint256(r) + 1) * m.duration + 1);
        g = gasleft();
        game.settle(0, r, 0, 0);
        emit log_named_uint("settle gas", g - gasleft());
    }
}
