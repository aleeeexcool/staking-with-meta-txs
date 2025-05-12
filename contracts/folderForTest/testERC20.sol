// SPDX-License-Identifier: MIT
pragma solidity =0.8.23;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract testERC20 is ERC20, ERC20Permit {
    constructor(uint256 initialSupply) ERC20("TEA", "TEA") ERC20Permit("TEA") {
        _mint(msg.sender, initialSupply);
    }
    
    function hashTypedDataV4(bytes32 structHash) external view returns (bytes32) {
        return super._hashTypedDataV4(structHash);
    }
}