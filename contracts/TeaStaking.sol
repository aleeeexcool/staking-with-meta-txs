// SPDX-License-Identifier: MIT
pragma solidity =0.8.23;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC2771Context, Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Permitable} from "./components/Permitable.sol";

import {IAllowanceTransfer} from "./interfaces/IAllowanceTransfer.sol";
import {ITeaStaking} from "./interfaces/ITeaStaking.sol";
import {ITeaVesting} from "./interfaces/ITeaVesting.sol";
import {SignatureHandler} from "./SignatureHandler.sol";

/// @title TeaStaking
/// @notice The contract which allowing users to stake Tea and presale tokens, earn allocationrewards, and manage theirs stakes
contract TeaStaking is ITeaStaking, ReentrancyGuard, SignatureHandler, ERC2771Context, Permitable {
    using SafeERC20 for IERC20Metadata;
    using EnumerableSet for *;

    /// @notice 1 year in days
    uint256 public constant ONE_YEAR = 365 days;
    /// @notice The precision of the accumulated rewards
    uint256 public constant ACCUMULATED_PRECISION = 1e18;
    /// @notice The amount of VIP tokens
    uint256 public immutable vipAmount;

    /// @notice The amount of total staked tokens
    uint256 public totalStakedTokens;
    /// @notice The amount of total staked Tea
    uint256 public totalStakedTea;
    /// @notice The amount of total allocation
    uint256 public totalAllocation;
    /// @notice The amount of allocation per second
    uint256 public allocationPerSecond;
    /// @notice The amount of rewards per share
    uint256 public rewardPerShare;

    /// @notice The block number of the last reward
    uint256 public lastRewardBlockNumber;
    /// @notice The timestamp of the last reward
    uint256 public lastUpdatedTimestamp;
    /// @notice The start date of the staking
    uint256 public startDate;
    /// @notice The end date of the staking
    uint256 public endDate;

    /// @notice The counter for stake IDs
    uint256 public counter;

    /// @notice The address of the treasury
    address public immutable treasury;
    /// @notice The address of the Tea vesting contract
    ITeaVesting public immutable teaVesting;
    /// @notice The address of the Tea token
    IERC20Metadata public immutable teaToken;

    /// @notice The state of the staking
    bool public stakingRun;

    /// @notice The mapping of each stake
    mapping(uint256 id => Stake stake) public stakes;
    ///@notice The mapping of each presale token
    mapping(address token => bool valid) private validTokens;
    /// @notice The mapping of each users' stake IDs
    mapping(address user => EnumerableSet.UintSet ids) private userIds;

    // ------------------------------------------ Constructor -------------------------------------

    /**
     * @notice Constructor of the contract
     * @param admin The address of the admin
     * @param treasury_ The address of the treasury
     * @param operators The list of operators
     * @param trustedForwarder The address of the trusted forwarder
     * @param teaVesting_ The address of the vesting contract
     * @param teaToken_ The address of the token
     * @param presaleTokens The list of presale tokens
     */
    constructor(
        address admin,
        address treasury_,
        address[] memory operators,
        address trustedForwarder,
        address teaVesting_,
        address teaToken_,
        address[] memory presaleTokens,
        address permit2_
    ) ERC2771Context(trustedForwarder) SignatureHandler(operators) Permitable(permit2_) {
        if (
            admin == address(0) || treasury_ == address(0) || trustedForwarder == address(0)
                || teaVesting_ == address(0) || teaToken_ == address(0)
        ) {
            revert NoZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        treasury = treasury_;
        teaVesting = ITeaVesting(teaVesting_);
        teaToken = IERC20Metadata(teaToken_);

        uint256 teaDecimals = teaToken.decimals();
        vipAmount = 1_000_000 * 10 ** teaDecimals;

        uint256 length = presaleTokens.length;
        for (uint256 i = 0; i < length; ++i) {
            if (presaleTokens[i] == address(0)) {
                revert NoZeroAddress();
            }
            if (IERC20Metadata(presaleTokens[i]).decimals() != teaDecimals) {
                revert WrongDecimalNumber();
            }
            if (teaVesting.getVestingTokens(presaleTokens[i]).dateEnd == 0) revert OnlyValidToken();
            validTokens[presaleTokens[i]] = true;
        }
    }

    // ------------------------------------------ External Admin functions ------------------------

    /// @notice Allows the admin to initialize the staking
    /// @param newTotalAllocation The total amount of allocation to be distributed
    /// @param newRewardDistributionStartTime The start time of the reward distribution
    function initializeStaking(uint256 newTotalAllocation, uint256 newRewardDistributionStartTime) external {
        _checkRole(DEFAULT_ADMIN_ROLE, msg.sender);
        if (!stakingRun) {
            totalAllocation = newTotalAllocation;
            allocationPerSecond = newTotalAllocation / ONE_YEAR;
            lastUpdatedTimestamp = newRewardDistributionStartTime;
            startDate = newRewardDistributionStartTime;
            endDate = newRewardDistributionStartTime + ONE_YEAR;
            stakingRun = true;

            teaToken.safeTransferFrom(treasury, address(this), totalAllocation);

            emit StakingInitialized(startDate, endDate, totalAllocation, allocationPerSecond);
        } else {
            revert StakingAlreadyInitialized();
        }
    }

    /// @notice Allows the admin to withdraw all allocation from contract
    function emergencyWithdraw() external {
        _checkRole(DEFAULT_ADMIN_ROLE, msg.sender);
        uint256 balanceContract = teaToken.balanceOf(address(this));
        teaToken.safeTransfer(msg.sender, balanceContract - totalStakedTea);
    }

    // ------------------------------------------ External functions ------------------------------

    function stake(
        address[] calldata tokens,
        uint256[] calldata amounts,
        OffChainStruct[] calldata offChainData,
        IAllowanceTransfer.PermitSingle calldata permitSingleStruct,
        bytes calldata permitSingleSignature,
        TokenPermitSignatureDetails calldata tokenPermitSignatureDetails
    )
        external
    {
        _makeTokenPermit(permitSingleStruct.details.token, tokenPermitSignatureDetails);
        stake(tokens, amounts, offChainData, permitSingleStruct, permitSingleSignature);
    }


    function stake(
        address[] calldata tokens,
        uint256[] calldata amounts,
        OffChainStruct[] calldata offChainData,
        IAllowanceTransfer.PermitSingle calldata permitSingleStruct,
        bytes calldata permitSingleSignature
    )
        public
    {
        _makePermit2(permitSingleStruct, permitSingleSignature);
        stake(tokens, amounts, offChainData);
    }

    function stake(address[] calldata tokens, uint256[] calldata amounts, OffChainStruct[] calldata offChainData) public {   
        bool active = startDate < block.timestamp && block.timestamp <= endDate;
        if (!active) revert StakingNotActive();
        if (tokens.length != amounts.length || amounts.length != offChainData.length) revert InvalidArrayLengths();

        address user = _msgSender();
        uint256 length = tokens.length;

        for (uint256 i = 0; i < length; ++i) {
            address _token = tokens[i];
            uint256 _amount = amounts[i];

            if (_amount == 0) revert NoZeroAmount();
            if (!checkTokenValidity(_token)) revert OnlyValidToken();
            if (_isTeaToken(_token)) {
                _receivePayment(_token, address(this), _amount);

                totalStakedTea += _amount;
            } else {
                if (_token != offChainData[i].token || address(this) != offChainData[i].to) revert AddressesMismatch();
                ITeaVesting.UserVesting memory vestingInfo = teaVesting.getVestingUsers(user, _token);
                if (vestingInfo.tokensForVesting - vestingInfo.totalVestingClaimed < _amount) {
                    revert NotEnoughLockedTokens();
                }
                teaVesting.transferOwnerOffChain(offChainData[i]);
            }

            updateRewardPerShare();

            bool _vip = false;
            uint256 _lockedPeriod = 0;

            if (_amount >= vipAmount) {
                _vip = true;
                _lockedPeriod = block.timestamp + ONE_YEAR;
            }

            uint256 newId = ++counter;
            stakes[newId] = (
                Stake({
                    vip: _vip,
                    token: _token,
                    stakedTokens: _amount,
                    availableTokens: 0,
                    rewardDebt: _amount * rewardPerShare / ACCUMULATED_PRECISION,
                    claimCooldown: 0,
                    lockedPeriod: _lockedPeriod
                })
            );

            totalStakedTokens += _amount;
            userIds[user].add(newId);

            emit Staked(user, newId, _token, _amount);
        }
    }


    function claim(UnstakeParam calldata claimStruct) external {
        address user = _msgSender();
        (bool success, string memory errorReason) = _verifySignature(user, claimStruct, false);
        require(success, errorReason);

        uint256 length = claimStruct.ids.length;
        uint256 amountToClaim = 0;

        for (uint256 i = 0; i < length; ++i) {

            uint256 _id = claimStruct.ids[i];
            uint256 _rewardBack = claimStruct.rewardsWithLoyalty[i];
            Stake storage userStake = stakes[_id];

            if (!_isIdValid(user, _id)) revert InvalidId(_id);
            if (userStake.stakedTokens == 0) revert NothingToClaim(_id);

            updateRewardPerShare();

            uint256 pendingReward = _harvest(_id);
            uint256 rewardWithThreshold = pendingReward + (pendingReward / 2);

            if (_rewardBack > rewardWithThreshold) {
                revert InvalidCalculationReward(_rewardBack, rewardWithThreshold);
            } else {
                userStake.rewardDebt += _rewardBack;
            }

            amountToClaim += _rewardBack;
            emit Claim(user, _id, _rewardBack);
        }
        teaToken.safeTransfer(user, amountToClaim);
    }

    /// @inheritdoc ITeaStaking
    function unstake(UnstakeParam calldata unstakeParams) external {
        (bool success, string memory errorReason) = _verifySignature(_msgSender(), unstakeParams, true);
        require(success, errorReason);

        _unstake(unstakeParams.ids, unstakeParams.rewardsWithLoyalty);
    }

    /// @inheritdoc ITeaStaking
    function withdraw(uint256[] memory ids) external nonReentrant {
        address user = _msgSender();
        uint256 length = ids.length;

        for (uint256 i = 0; i < length; ++i) {
            uint256 _id = ids[i];

            if (!_isIdValid(user, _id)) revert InvalidId(_id);

            Stake storage userStake = stakes[_id];
            if (userStake.availableTokens == 0) {
                revert NeedToUnstakeFirst(_id);
            }

            if (!userStake.vip && userStake.claimCooldown > block.timestamp) {
                revert ClaimCooldownNotPassed();
            }

            address token = userStake.token;
            uint256 _availableTokens = userStake.availableTokens;

            _removeFromSystem(user, _id);

            if (_isTeaToken(token)) {
                teaToken.safeTransfer(user, _availableTokens);
            } else {
                teaVesting.claim(token, user);
                teaVesting.transferOwnerOnChain(token, address(this), user);
            }
            emit Withdrawal(user, token, _id, _availableTokens);
        }
    }

    // ------------------------------------------ External / Public view functions ----------------

    /// @inheritdoc ITeaStaking
    function getUserIds(address user) public view returns (uint256[] memory) {
        return userIds[user].values();
    }

    function getPendingRewards(uint256 id) public view returns (uint256 reward) {
        if (totalStakedTokens > 0 && stakingRun) {
            uint256 timePassed = 0;
            if (block.timestamp < endDate) {
                timePassed = block.timestamp - lastUpdatedTimestamp;
            } else {
                timePassed = endDate - lastUpdatedTimestamp;
            }
            uint256 tokensAccum = timePassed * allocationPerSecond;
            uint256 rewardPerShare_ = rewardPerShare + (tokensAccum * ACCUMULATED_PRECISION / totalStakedTokens);
            Stake storage userStake = stakes[id];
            uint256 accumulatedReward = userStake.stakedTokens * rewardPerShare_ / ACCUMULATED_PRECISION;
            return accumulatedReward - userStake.rewardDebt;
        }
    }

    /// @inheritdoc ITeaStaking
    function getTotalUserStakedTokens(address user) public view returns (uint256 totalAmount) {
        uint256 length = userIds[user].length();
        for (uint256 i = 0; i < length; ++i) {
            totalAmount += stakes[userIds[user].at(i)].stakedTokens;
        }
    }

    /// @inheritdoc ITeaStaking
    function updateRewardPerShare() public {
        if (block.number > lastRewardBlockNumber) {
            if (totalStakedTokens > 0 && stakingRun) {
                uint256 timePassed = 0;
                if (block.timestamp < endDate) {
                    timePassed = block.timestamp - lastUpdatedTimestamp;
                } else {
                    timePassed = endDate - lastUpdatedTimestamp;
                    stakingRun = false;
                }
                uint256 tokensAccum = timePassed * allocationPerSecond;
                rewardPerShare += tokensAccum * ACCUMULATED_PRECISION / totalStakedTokens;

                lastUpdatedTimestamp = block.timestamp;
                lastRewardBlockNumber = block.number;

                emit UpdatedShareReward(lastUpdatedTimestamp, totalStakedTokens, rewardPerShare);
            }
        }
    }

    /// @dev Internal function to check if token address is valid
    /// @param token The token of user's stake
    function checkTokenValidity(address token) public view returns (bool) {
        return validTokens[token] || _isTeaToken(token);
    }

    // ------------------------------------------ Private view functions --------------------------

    /// @dev Internal function to unstake tokens
    /// @param ids The IDs of user's stakes to be unstaked
    /// @param rewardsWithLoyalty The amount of rewards with loyalty bonus, which is using as a proof to verify the correctness of calculation
    function _unstake(uint256[] memory ids, uint256[] calldata rewardsWithLoyalty) private {
        if (ids.length != rewardsWithLoyalty.length) revert InvalidArrayLengths();
        address user = _msgSender();
        uint256 length = ids.length;
        uint256 amountToClaim = 0;

        for (uint256 i = 0; i < length; ++i) {
            uint256 _id = ids[i];
            uint256 _rewardBack = rewardsWithLoyalty[i];

            if (!_isIdValid(user, _id)) revert InvalidId(_id);

            Stake storage userStake = stakes[_id];
            if (userStake.vip && !(block.timestamp > endDate + 30 days)) {
                if (block.timestamp < userStake.lockedPeriod) revert LockedPeriodNotPassed(_id);
            }
            if (userStake.stakedTokens == 0) revert NothingToUnstake(_id);

            updateRewardPerShare();
            uint256 pendingReward = _harvest(_id);

            uint256 amount = userStake.stakedTokens;
            userStake.stakedTokens = 0;
            totalStakedTokens -= amount;
            userStake.availableTokens += amount;

            uint256 rewardWithThreshold = pendingReward + (pendingReward / 2);

            if (_rewardBack > rewardWithThreshold) {
                revert InvalidCalculationReward(_rewardBack, rewardWithThreshold);
            } 
            userStake.claimCooldown = block.timestamp + 2 weeks;
            amountToClaim += _rewardBack;
            emit Claim(user, _id, _rewardBack);
            emit Unstaked(user, _id, amount);
        }
        teaToken.safeTransfer(user, amountToClaim);
    }

    /// @dev Internal function to check if user's ID is valid
    /// @param user The address of user
    /// @param id The ID of user's stake
    function _isIdValid(address user, uint256 id) private view returns (bool) {
        return userIds[user].contains(id);
    }

    /// @notice Returns a stake's reward
    /// @param id The ID of user's stake to be harvested
    /// @return reward The reward earned by the user for a specific stake
    function _harvest(uint256 id) private view returns (uint256) {
        Stake storage userStake = stakes[id];
        uint256 accumulatedReward = userStake.stakedTokens * rewardPerShare / ACCUMULATED_PRECISION;
        return accumulatedReward - userStake.rewardDebt;
    }

    /// @dev Internal function to remove user's stake from system
    /// @param user The address of user
    /// @param id The ID of user's stake
    function _removeFromSystem(address user, uint256 id) private {
        delete stakes[id];
        userIds[user].remove(id);
    }

    /// @dev Internal function to detect if token is a TEA token
    /// @param token The token address
    function _isTeaToken(address token) private view returns (bool) {
        return token == address(teaToken);
    }

    /**
     * @notice Overrides the function from inherited smart-contracts: `Context`, `ERC2771Context`
     * @dev The requirement from the ERC2771Recipient, see [gsn docs](https://docs.opengsn.org/contracts/#receiving-a-relayed-call)
     */
    function _msgSender() internal view override(Context, ERC2771Context) returns (address sender) {
        return super._msgSender();
    }

    /**
     * @notice Overrides the function from inherited smart-contracts: `Context`, `ERC2771Context`
     * @dev The requirement from the ERC2771Recipient, see [gsn docs](https://docs.opengsn.org/contracts/#receiving-a-relayed-call)
     */
    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return super._msgData();
    }

    /**
     * @notice Overrides the function from inherited smart-contracts: `Context`, `ERC2771Context`
     * @dev The requirement from the ERC2771Context, see [gsn docs](https://docs.opengsn.org/contracts/#receiving-a-relayed-call)
     */
    function _contextSuffixLength() internal view virtual override(Context, ERC2771Context) returns (uint256) {
        return super._contextSuffixLength();
    }
}
