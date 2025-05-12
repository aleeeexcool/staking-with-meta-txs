// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface ITokenPermitSignatureDetails {
    /**
     * @dev Token permit signature details struct
     * @dev See ERC20Permit.sol for more details, the PaymentData has the rest of the details
     * @param deadline The deadline of the permit
     * @param v The v value of the signature
     * @param r The r value of the signature
     * @param s The s value of the signature
     */
    struct TokenPermitSignatureDetails {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }
}
