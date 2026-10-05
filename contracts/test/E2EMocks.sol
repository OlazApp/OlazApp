// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// Devnet stand-ins placed with anvil_setCode at the real pool and feed
/// addresses, so the site and the contract read them exactly like mainnet.
contract E2EPool {
    address public token0;
    address public token1;
    uint256[] internal times;
    int24[] internal ticks;

    function init(address t0, address t1, int24 tick) external {
        require(times.length == 0, "init");
        token0 = t0;
        token1 = t1;
        times.push(block.timestamp - 7 days);
        ticks.push(tick);
    }

    function setTick(int24 tick) external {
        times.push(block.timestamp);
        ticks.push(tick);
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
            require(t >= times[0], "OLD");
            c[i] = cumulativeAt(t);
        }
    }
}

contract E2EFeed {
    uint80 public firstId;
    int256[] internal answers;
    uint256[] internal updated;

    function init(uint80 first) external {
        require(firstId == 0, "init");
        firstId = first;
    }

    function push(int256 answer) external {
        answers.push(answer);
        updated.push(block.timestamp);
    }

    function getRoundData(uint80 id) external view returns (uint80, int256, uint256, uint256, uint80) {
        require(id >= firstId && id - firstId < answers.length, "No data present");
        uint256 i = id - firstId;
        return (id, answers[i], updated[i], updated[i], id);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        uint256 i = answers.length - 1;
        uint80 id = firstId + uint80(i);
        return (id, answers[i], updated[i], updated[i], id);
    }
}
