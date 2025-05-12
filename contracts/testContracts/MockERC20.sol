// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract MockERC20 is ERC20Permit {
    constructor(
        string memory _name,
        string memory _symbol
    )
        ERC20(_name, _symbol)
        ERC20Permit("Mock ERC20")
    { }

    uint8 private DECIMALS = 18;

    function mint(address _addr, uint256 _amount) public {
        _mint(_addr, _amount);
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    )
        public
        override
        returns (bool)
    {
        _transfer(sender, recipient, amount);
        return true;
    }

    function decimals() public view override returns (uint8) {
        return DECIMALS;
    }

    function setDecimals(uint8 _decimals) public {
        DECIMALS = _decimals;
    }
}
