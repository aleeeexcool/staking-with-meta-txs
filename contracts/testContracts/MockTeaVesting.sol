// SPDX-License-Identifier: MIT
pragma solidity =0.8.23;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

error NothingToClaim();

contract MockTeaVesting {
    using SafeERC20 for IERC20;

    struct UserVesting {
        uint256 tokensForVesting;
        uint256 totalVestingClaimed;
    }

    struct VestingOption {
        uint256 dateEnd;
        uint256 dateStart;
        uint256 dateDuration;
        uint256 percentUnlock;
    }

    struct OffChainStruct {
        address token;
        address from;
        address to;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    address public teaToken;
    uint256 public vestingStarted;

    mapping(address => VestingOption) public getVestingTokens;
    mapping(address user => mapping(address token => UserVesting userVesting)) public getVestingUsers;

    constructor(address _treToken, address[] memory _presaleTokens) {
        teaToken = _treToken;
        vestingStarted = block.timestamp;
        for (uint256 i = 0; i < _presaleTokens.length; i++) {
            getVestingTokens[_presaleTokens[i]] = VestingOption({
                dateEnd: block.timestamp + 365 days,
                dateStart: block.timestamp,
                dateDuration: 365 days,
                percentUnlock: 5000
            });
        }
    }

    // ------------------------------------------ External functions ------------------------------

    function vest(address _tokenAddr, address _userAddr) external {
        uint256 totalTokens = IERC20(_tokenAddr).balanceOf(_userAddr);
        IERC20(_tokenAddr).safeTransferFrom(_userAddr, address(this), totalTokens);

        uint256 tokensToSend = totalTokens / 2;
        uint256 lockedTokens = totalTokens - tokensToSend;

        IERC20(teaToken).safeTransfer(_userAddr, tokensToSend);

        getVestingUsers[_userAddr][_tokenAddr] = UserVesting({tokensForVesting: lockedTokens, totalVestingClaimed: 0});
    }

    function claim(address _tokenAddr, address _userAddr) external {
        UserVesting storage _userVesting = getVestingUsers[_tokenAddr][_userAddr];

        uint256 amount = calculateReward(_tokenAddr, _userAddr);
        if (amount <= _userVesting.tokensForVesting && amount > 0) {
            _userVesting.tokensForVesting -= amount;
            _userVesting.totalVestingClaimed += amount;
            IERC20(_tokenAddr).safeTransfer(msg.sender, amount);
        } else {
            delete getVestingUsers[_userAddr][_tokenAddr];
            IERC20(_tokenAddr).safeTransfer(msg.sender, amount);
        }
    }

    function getUserUnlockReward(address _tokenAddr, address _userAddr) public view returns (uint256) {
        return calculateReward(_tokenAddr, _userAddr);
    }

    function transferOwnerOnChain(address _token, address _from, address _owner) public {}

    function transferOwnerOffChain(OffChainStruct calldata _offChainStruct) public {}

    function calculateReward(address _tokenAddr, address _userAddr) private view returns (uint256) {
        UserVesting storage _userVesting = getVestingUsers[_userAddr][_tokenAddr];
        uint256 timePassed = block.timestamp - vestingStarted;
        return (_userVesting.tokensForVesting / 365 days) * timePassed;
    }
}
