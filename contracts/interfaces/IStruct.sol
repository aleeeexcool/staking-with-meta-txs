// SPDX-License-Identifier: MIT
pragma solidity =0.8.23;

/**
 * @title IStruct
 * @notice Interface for storing transfer ownership and unstake param signature structs
 */
interface IStruct {
    /// @notice Error indicating that the provided address is the zero address
    error NoZeroAddress();
    /**
     * @dev Transfer ownership signature struct
     * @param token The address of the presale token
     * @param from The address of the previous owner
     * @param to The address of the new owner
     * @param deadline Timestamp of the deadline
     * @param v ECDSA signature V
     * @param r ECDSA signature R
     * @param s ECDSA signature S
     */

    struct OffChainStruct {
        address token;
        address from;
        address to;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /**
     * @dev VestingOption struct
     * @param dateEnd - Date in timestamp when vesting is end
     * @param dateStart - Date in timestamp when vesting is start
     * @param dateDuration - (dateEnd - dateStart)
     * @param percentUnlock - precent of force unlock when user vest
     */
    struct VestingOption {
        uint256 dateEnd;
        uint256 dateStart;
        uint256 dateDuration;
        uint256 percentUnlock;
    }

    /**
     * @dev Unstake param signature struct
     * @param user The address of the user
     * @param operator The address of the operator
     * @param ids IDs of the staked tokens
     * @param rewardsWithLoyalty The amount of rewards with loyalty
     * @param nonce The number of nonce
     * @param deadline Timestamp of the deadline
     * @param v ECDSA signature V
     * @param r ECDSA signature R
     * @param s ECDSA signature S
     */
    struct UnstakeParam {
        address user;
        address operator;
        uint256[] ids;
        uint256[] rewardsWithLoyalty;
        uint256 nonce;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }
}
