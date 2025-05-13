// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {ZeroAddressError} from "../interfaces/ZeroAddressError.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract TeaToken is ERC20, ERC2771Context, ERC20Permit, ERC20Votes, ZeroAddressError, Ownable, ERC20Burnable {
    /**
     * @dev Constructor
     * @param name_ The name of the Tea token
     * @param symbol_ The symbol of the Native token
     * @param trustedForwarder_ The trusted forwarder address
     * @param multisigWallet The multisig wallet address
     * @param _treasury The treasury address
     * @param initialSupply The initial supply of the token
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address trustedForwarder_,
        address multisigWallet,
        address _treasury,
        uint256 initialSupply
    ) ERC20(name_, symbol_) ERC2771Context(trustedForwarder_) ERC20Permit(name_) Ownable(multisigWallet) {
        if (trustedForwarder_ == address(0) || _treasury == address(0)) revert ZeroAddress();
        _mint(_treasury, initialSupply);
    }

    /**
     * @notice Mint new tokens to `recipient` by Owner
     * @param recipient The address to mint tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address recipient, uint256 amount) external onlyOwner {
        // recipient is checked in ERC20._mint
        _mint(recipient, amount);
    }

    /**
     * @dev Overrides IERC6372 functions to make the token & governor timestamp-based
     */
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    /**
     * @dev Overrides IERC6372 functions to make the token & governor timestamp-based
     */
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    /**
     * @notice Overrides the function from inherited smart-contracts: `ERC20Permit`, `Nonces`
     * @dev See {ERC20Permit-nonces}, {Nonces-nonces}
     */
    function nonces(address _owner) public view virtual override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(_owner);
    }

    /**
     * @notice Overrides the function from inherited smart-contracts: `ERC20`, `ERC20Votes`
     * @dev See {ERC20-_update}, {ERC20Votes-_update}
     */
    function _update(address _from, address _to, uint256 _value) internal virtual override(ERC20, ERC20Votes) {
        super._update(_from, _to, _value);
    }

    /**
     * @notice Overrides the function from inherited smart-contracts: `Context`, `ERC2771Context`
     * @dev The requirement from the ERC2771Context
     */
    function _msgSender() internal view virtual override(Context, ERC2771Context) returns (address) {
        return super._msgSender();
    }

    /**
     * @notice Overrides the function from inherited smart-contracts: `Context`, `ERC2771Context`
     * @dev The requirement from the ERC2771Context
     */
    function _msgData() internal view virtual override(Context, ERC2771Context) returns (bytes calldata) {
        return super._msgData();
    }

    /**
     * @notice Overrides the function from inherited smart-contracts: `Context`, `ERC2771Context`
     * @dev The requirement from the ERC2771Context
     */
    function _contextSuffixLength() internal view virtual override(Context, ERC2771Context) returns (uint256) {
        return super._contextSuffixLength();
    }

    /**
     * @notice Hashes the struct data, see [eip712 docs](https://eips.ethereum.org/EIPS/eip-712)
     * @param structHash - Hash of the struct
     */
    function hashTypedDataV4(bytes32 structHash) external view returns (bytes32) {
        return super._hashTypedDataV4(structHash);
    }
}
