// SPDX-License-Identifier: MIT
pragma solidity =0.8.23;

import {IStruct} from "./IStruct.sol";

/**
 * @title ITeaVesting
 * @notice Interface for Tea Vesting contract which manages token vesting for users, allowing them to claim tokens over time
 * @dev This interface defines the structures and functions related to user token vesting
 */
interface ITeaVesting is IStruct {
    /**
     * @notice Structure representing a user's vesting details
     * @param tokensForVesting The total number of tokens allocated for vesting
     * @param totalVestingClaimed The total number of tokens that the user has already claimed from their vesting allocation
     */
    struct UserVesting {
        uint256 tokensForVesting;
        uint256 totalVestingClaimed;
    }

    /**
     * @notice Returns the vesting details of a user for a specific token
     * @param user The address of the user whose vesting information is being requested
     * @param token The address of the token being vested
     * @return A UserVesting struct containing the user's vesting information, including total tokens for vesting and claimed tokens
     */
    function getVestingUsers(address user, address token) external view returns (UserVesting memory);

    /**
     * @notice Returns the amount of unlocked rewards that a user can claim for a specific token
     * @param token The address of the token for which the reward is being checked
     * @param user The address of the user whose unlocked reward is being queried
     * @return The amount of unlocked tokens available for the user to claim
     */
    function getUserUnlockReward(address token, address user) external view returns (uint256);

    /**
     * @notice Allows a user to claim their vested tokens
     * @param token The address of the token being claimed
     * @param owner The address of the owner (user) claiming the tokens
     * @dev The function handles the actual claiming process, making sure the user can claim their unlocked rewards
     */
    function claim(address token, address owner) external;

    /**
     * @notice Transfers ownership of vested tokens on-chain between two addresses
     * @param token The address of the token being transferred
     * @param from The address of the current owner
     * @param owner The address of the new owner to whom the tokens are transferred
     * @dev This function handles token ownership transfer on-chain, updating records accordingly
     */
    function transferOwnerOnChain(address token, address from, address owner) external;

    /**
     * @notice Transfers ownership of vested tokens off-chain using an OffChainStruct
     * @param offChainStruct A structure containing off-chain data necessary for the ownership transfer
     * @dev This function facilitates the off-chain transfer of token ownership by relying on off-chain data inputs
     */
    function transferOwnerOffChain(OffChainStruct memory offChainStruct) external;

    /**
     * @notice Returns the vesting details of a presale token
     * @param token The address of the presale token
     * @return A VestingOption struct containing the token's vesting details
     */
    function getVestingTokens(address token) external view returns (VestingOption memory);
}
