// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.23;

import {IAllowanceTransfer} from "../interfaces/IAllowanceTransfer.sol";
import "../interfaces/ZeroAddressError.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {ITokenPermitSignatureDetails} from "../interfaces/ITokenPermitSignatureDetails.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
abstract contract Permitable is ZeroAddressError, ITokenPermitSignatureDetails, Context {
    /// @notice The permit2 contract
    IAllowanceTransfer public immutable permit2;

    /**
     * @dev Constructor
     * @param _permit2 The permit2 address
     */
    constructor(address _permit2) {
        if (_permit2 == address(0)) revert ZeroAddress();
        permit2 = IAllowanceTransfer(_permit2);
    }

    /**
     * @notice Used when user pays the first time with this token in Permit2
     * @dev Makes both permits: inside the token and in Permit2 contract
     * @param token The token address
     * @param tokenPermitSignatureDetails Token permit signature details, see {TokenPermitSignatureDetails}
     */
    function _makeTokenPermit(
        address token,
        TokenPermitSignatureDetails calldata tokenPermitSignatureDetails
    ) internal {
        if (IERC20(token).allowance(_msgSender(), address(permit2)) == type(uint256).max) return;
        // make the first permit in token if it's first
        IERC20Permit(token).permit(
            _msgSender(),
            address(permit2),
            type(uint256).max, // max uint256
            tokenPermitSignatureDetails.deadline,
            tokenPermitSignatureDetails.v,
            tokenPermitSignatureDetails.r,
            tokenPermitSignatureDetails.s
        );
    }

    /**
     * @notice Used when user already has the token allowance to Permit2 contract
     * @dev Makes only the permit in Permit2 contract
     * @param permitSingleStruct Permit signature details, see {IAllowanceTransfer.PermitSingle}
     * @param signature Permit signature (packed v, r, s)
     */
    function _makePermit2(
        IAllowanceTransfer.PermitSingle calldata permitSingleStruct,
        bytes calldata signature
    ) internal {
        (uint160 amount, uint48 expiration, ) = permit2.allowance(
            _msgSender(),
            permitSingleStruct.details.token,
            address(this)
        );
        if (amount == permitSingleStruct.details.amount && expiration > block.timestamp) return;
        permit2.permit(_msgSender(), permitSingleStruct, signature);
    }

    /**
     * @notice Used when user already has both allowances (token and Permit2)
     * @dev Receives the payment using Permit2 contract
     * @param token The token address
     * @param amount The amount of tokens
     */
    function _receivePayment(address token, address to, uint256 amount) internal {
        if (amount > 0) {
            permit2.transferFrom(_msgSender(), to, uint160(amount), token);
        }
    }
}
