// SPDX-License-Identifier: MIT
pragma solidity =0.8.23;

import {IStruct} from "./IStruct.sol";
import {IAllowanceTransfer} from "./IAllowanceTransfer.sol";
import {ITokenPermitSignatureDetails} from "./ITokenPermitSignatureDetails.sol";
/**
 * @title ITeaStaking
 * @notice Interface for Tea Staking contract allowing users to stake tokens, earn rewards, and manage staking details
 * @dev This interface defines the structure and errors used in the Tea Staking system
 */
interface ITeaStaking is IStruct {
    /**
     * @notice Structure representing a user's stake
     * @param vip Whether the user is marked as a VIP
     * @param token The address of the token being staked
     * @param stakedTokens The total number of tokens staked by the user
     * @param availableTokens The number of tokens available for withdrawal
     * @param rewardDebt The amount of rewards that accumulated for the user
     * @param claimCooldown The minimum period before the user can claim rewards
     * @param lockedPeriod The duration for VIP users in which the staked tokens are locked and cannot be unstaked
     */
    struct Stake {
        bool vip;
        address token;
        uint256 stakedTokens;
        uint256 availableTokens;
        uint256 rewardDebt;
        uint256 claimCooldown;
        uint256 lockedPeriod;
    }

    /// @notice Error indicating that staking has already been initialized
    error StakingAlreadyInitialized();

    /// @notice Error indicating that staking is not active
    error StakingNotActive();

    /// @notice Error indicating that the user has already staked tokens with the specified token
    error UserAlreadyStakedWithThisToken();

    /// @notice Error indicating that the amount of tokens to stake cannot be zero
    error NoZeroAmount();

    /// @notice Error indicating that only valid tokens are accepted for staking
    error OnlyValidToken();

    /// @notice Error indicating that the provided addresses do not match the addresses from off-chain data
    error AddressesMismatch();

    /**
     * @notice Error indicating there is nothing to unstake for the given stake ID
     * @param id The ID of the stake that cannot be unstaked
     */
    error NothingToUnstake(uint256 id);

    /**
     * @notice Error indicating there is nothing to claim for the given stake ID
     * @param id The ID of the stake that cannot be claimed
     */
    error NothingToClaim(uint256 id);


    /// @notice Error indicating that the provided array lengths are invalid
    error InvalidArrayLengths();

    /// @notice Error indicating that the provided decimal number is invalid
    error WrongDecimalNumber();

    /**
     * @notice Error indicating that the provided stake ID is invalid
     * @param id The invalid stake ID
     */
    error InvalidId(uint256 id);

    /**
     * @notice Error indicating that the locked period has not passed for the given stake ID
     * @param id The ID of the stake with the locked period still active
     */
    error LockedPeriodNotPassed(uint256 id);

    /// @notice Error indicating that the claim cooldown period has not passed
    error ClaimCooldownNotPassed();

    /**
     * @notice Error indicating the user needs to unstake the tokens first before performing another action
     * @param id The ID of the stake requiring unstaking
     */
    error NeedToUnstakeFirst(uint256 id);

    /**
     * @notice Error indicating a mismatch in reward calculations between proof and contract
     * @param proofCalculation The reward calculated via proof
     * @param contractCalculation The reward calculated by the contract
     */
    error InvalidCalculationReward(uint256 proofCalculation, uint256 contractCalculation);

    /// @notice Error indicating that the user does not have enough locked tokens to perform an action
    error NotEnoughLockedTokens();

    /**
     * @notice Emitted when the staking contract is initialized
     * @param starDate The start date of the staking
     * @param endDate The end date of the staking
     * @param totalAllocation The total amount of tokens allocated
     * @param allocationPerSecond The amount of tokens allocated per second
     */
    event StakingInitialized(
        uint256 indexed starDate, uint256 indexed endDate, uint256 indexed totalAllocation, uint256 allocationPerSecond
    );

    /**
     * @notice Emitted when a user stakes tokens
     * @param staker The address of the user staking the tokens
     * @param id The ID of the stake
     * @param token The address of the token being staked
     * @param amount The amount of tokens staked
     */
    event Staked(address indexed staker, uint256 indexed id, address indexed token, uint256 amount);

    /**
     * @notice Emitted when a user unstakes tokens
     * @param staker The address of the user unstaking tokens
     * @param id The ID of the stake being unstaked
     * @param amount The amount of tokens unstaked
     */
    event Unstaked(address indexed staker, uint256 indexed id, uint256 amount);

    /**
     * @notice Emitted when a user withdraws staked tokens along with rewards
     * @param staker The address of the user withdrawing tokens
     * @param token The address of the token being withdrawn
     * @param stakedTokens The amount of staked tokens being withdrawn
     */
    event Withdrawal(address indexed staker, address indexed token, uint256 indexed stakeId, uint256 stakedTokens);

    /**
     * @notice Emitted when the reward per share is updated
     * @param timestamp The time at which the reward per share was updated
     * @param totalStakedTokens The total number of staked tokens at the time of the update
     * @param rewardPerShare The updated reward per share value
     */
    event UpdatedShareReward(uint256 indexed timestamp, uint256 totalStakedTokens, uint256 rewardPerShare);

    
    /**
     * @notice Claim rewards
     * @param user Claimer address
     * @param id ID of staking
     * @param amount Amount to claim 
     */
    event Claim(address indexed user, uint256 indexed id, uint256 amount);


    /**
     * @notice Allows a user to stake multiple tokens with specified amounts
     * @dev This function handles the staking process for multiple tokens at once, validating inputs and processing off-chain data
     * @param tokens An array of addresses representing the tokens that the user wishes to stake
     * @param amounts An array of amounts, corresponding to the number of tokens the user is staking for each token in `tokens`
     * @param offChainData An OffChainStruct containing additional off-chain data related to the staking process
     */
    function stake(address[] calldata tokens, uint256[] calldata amounts, OffChainStruct[] calldata offChainData)
        external;

    /**
     * @notice Allows a user to stake multiple tokens with specified amounts
     * @dev This function handles the staking process for multiple tokens at once, validating inputs and processing off-chain data
     * @param tokens An array of addresses representing the tokens that the user wishes to stake
     * @param amounts An array of amounts, corresponding to the number of tokens the user is staking for each token in `tokens`
     * @param offChainData An OffChainStruct containing additional off-chain data related to the staking process
     * @param permitSingleStruct The permit signature details for the staking process
     * @param permitSingleSignature The permit signature for the staking process
     * @param tokenPermitSignatureDetails The token permit signature details for the staking process
     */
    function stake(
        address[] calldata tokens,
        uint256[] calldata amounts,
        OffChainStruct[] calldata offChainData,
        IAllowanceTransfer.PermitSingle calldata permitSingleStruct,
        bytes calldata permitSingleSignature,
        ITokenPermitSignatureDetails.TokenPermitSignatureDetails calldata tokenPermitSignatureDetails
    ) external;

    /**
     * @notice Allows a user to stake multiple tokens with specified amounts
     * @dev This function handles the staking process for multiple tokens at once, validating inputs and processing off-chain data
     * @param tokens An array of addresses representing the tokens that the user wishes to stake
     * @param amounts An array of amounts, corresponding to the number of tokens the user is staking for each token in `tokens`
     * @param offChainData An OffChainStruct containing additional off-chain data related to the staking process
     * @param permitSingleStruct The permit signature details for the staking process
     * @param permitSingleSignature The permit signature for the staking process
     */
    function stake(
        address[] calldata tokens,
        uint256[] calldata amounts,
        OffChainStruct[] calldata offChainData,
        IAllowanceTransfer.PermitSingle calldata permitSingleStruct,
        bytes calldata permitSingleSignature
    ) external;

    /**
     * @notice Allows a user to unstake their staked tokens based on specified parameters
     * @dev This function processes the unstaking request and adjusts the user's stake accordingly
     * @param unstakeParams A struct containing the parameters for the unstaking process, such as the token, amount, and other necessary details
     */
    function unstake(UnstakeParam calldata unstakeParams) external;

    /**
     * @notice Allows a user to withdraw their staked tokens and rewards for multiple stake IDs
     * @dev This function handles the withdrawal of tokens and rewards while ensuring non-reentrant security
     * @param ids An array of stake IDs representing the specific stakes the user wishes to withdraw
     */
    function withdraw(uint256[] memory ids) external;

    /**
     * @notice Returns an array of stake IDs associated with a specific user
     * @param user The address of the user whose stake IDs are being queried
     * @return An array of uint256 representing the stake IDs that belong to the user
     */
    function getUserIds(address user) external view returns (uint256[] memory);

    /**
     * @notice Returns the total amount of tokens staked by a specific user
     * @dev This function calculates and returns the cumulative total of all tokens staked by the user across different stakes
     * @param user The address of the user whose total staked tokens are being queried
     * @return totalAmount The total amount of tokens the user has staked
     */
    function getTotalUserStakedTokens(address user) external view returns (uint256 totalAmount);

    /**
     * @notice Updates the reward per share for all staked tokens in the contract
     * @dev This function recalculates and updates the reward per share value, which affects the rewards distribution for all users
     */
    function updateRewardPerShare() external;
}
