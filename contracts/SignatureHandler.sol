// SPDX-License-Identifier: MIT
pragma solidity =0.8.23;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {IStruct} from "./interfaces/IStruct.sol";

abstract contract SignatureHandler is EIP712, AccessControl, IStruct {
    /// @dev Mapping to track signature nonces, operator's address => caller's address => signature nonce
    mapping(address operator => mapping(address caller => uint256 nonce)) public operatorUserNonces;
    /// @dev keccak256("unstake(UnstakeParam calldata _params)")
    bytes32 public constant UNSTAKE_TYPEHASH = 0xb89cb22cf091ea736d7376247904b200f2ad707ec01c556961bab09586165a4a;
    /// @dev keccak256("claim(UnstakeParam calldata claimStruct)")
    bytes32 public constant CLAIM_TYPEHASH = 0x15aa6b515a0ec6a27e4e54b358f3569fc0dc1bf085748dc59491c935e9111f4a;

    /// @dev keccak256("OPERATOR_ROLE")
    bytes32 public constant OPERATOR_ROLE = 0x20296b01d0b6bd176f0c1e29644934c0047abf080dae43609a1bbc09e39bafdb;

    constructor(address[] memory operators) EIP712("Staking", "1.0") {
        uint256 length = operators.length;
        for (uint256 i = 0; i < length; ++i) {
            if (operators[i] == address(0)) revert NoZeroAddress();
            _grantRole(OPERATOR_ROLE, operators[i]);
        }
    }

    function _verifySignature(address from, UnstakeParam calldata unstakeParam, bool isUnstake)
        internal
        returns (bool result, string memory errorReason)
    {
        bytes32 typehash = isUnstake ? UNSTAKE_TYPEHASH : CLAIM_TYPEHASH;
        bytes memory encodedData = abi.encode(
            typehash,
            unstakeParam.user,
            unstakeParam.ids,
            unstakeParam.rewardsWithLoyalty,
            unstakeParam.nonce,
            unstakeParam.deadline
        );
        return _verifySignature(
            encodedData,
            from,
            unstakeParam.operator,
            unstakeParam.nonce,
            unstakeParam.deadline,
            unstakeParam.v,
            unstakeParam.r,
            unstakeParam.s
        );
    }

    function _verifySignature(
        bytes memory encodedData,
        address from,
        address operator,
        uint256 nonce,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal returns (bool result, string memory errorReason) {
        if (!hasRole(OPERATOR_ROLE, operator)) {
            return (false, "INVALID_OPERATOR");
        }
        if (deadline < block.timestamp) {
            return (false, "SIGNATURE_EXPIRED");
        }
        if (nonce != operatorUserNonces[operator][from]++) {
            return (false, "MISMATCHING_NONCES");
        }
        bytes32 digest = _hashTypedDataV4(keccak256(encodedData));
        address recoveredAddress = ECDSA.recover(digest, v, r, s);
        if (recoveredAddress != operator) {
            return (false, "INVALID_SIGNATURE");
        }
        return (true, "");
    }

    function hashTypedDataV4(bytes32 structHash) external view returns (bytes32) {
        return super._hashTypedDataV4(structHash);
    }
}
