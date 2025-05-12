import { MaxAllowanceTransferAmount, AllowanceTransfer, PermitSingle } from '@uniswap/permit2-sdk';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { ethers, config } from 'hardhat';
import { expect } from 'chai';
import { BigNumberish, Contract, Wallet } from 'ethers';
import { ecsign } from 'ethereumjs-util';

import {
  ERC20WithContext,
  TeaFiTrustedForwarder,
  IPermit2,
} from '../types';

export async function getCurrentBlockTimestamp() {
  const block = await ethers.provider.getBlock('latest');
  return block?.timestamp as number;
}

export const getSignatureGasLessTx = async (
  teaFiTrustedForwarder: TeaFiTrustedForwarder,
  from: HardhatEthersSigner,
  to: any,
  gas: any,
  data: string,
  nonce?: any,
) => {
  const accounts = config.networks.hardhat.accounts;
  const wallet = ethers.Wallet.fromPhrase(accounts.mnemonic); // Always using user1 account
  const privateKey = wallet.privateKey;

  const FORWARDER_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      'ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)',
    ),
  );
  if (nonce < 0 || nonce == undefined) {
    nonce = await teaFiTrustedForwarder.nonces(from);
  }
  const currentTime = await getCurrentBlockTimestamp();
  const deadline = currentTime + 15 * 60;
  const value = 0n;

  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint48', 'bytes32'],
      [FORWARDER_TYPEHASH, from.address, to, value, gas, nonce, deadline, ethers.keccak256(data)],
    ),
  );
  const digestFromContract = await teaFiTrustedForwarder.hashTypedDataV4(structHash);

  const { v, r, s } = ecsign(
    Buffer.from(digestFromContract.slice(2), 'hex'),
    Buffer.from(privateKey.slice(2), 'hex'),
  );

  const [rString, sString, vString] = [r.toString('hex'), s.toString('hex'), v.toString(16)];
  const sig = '0x' + rString + sString + vString;

  return {
    signature: sig,
    gas,
    deadline: '0x' + deadline.toString(16),
    value,
    data,
    from: from.address,
    to,
    r: rString,
    s: sString,
  };
};

export const getSignatureGasLessTxSignWithPrivateKey = async (
  teaFiTrustedForwarder: TeaFiTrustedForwarder,
  from: HardhatEthersSigner,
  to: any,
  gas: any,
  data: string,
  privateKey: any,
  nonce?: any,
) => {
  const accounts = config.networks.hardhat.accounts;
  const wallet = ethers.Wallet.fromPhrase(accounts.mnemonic); // Always using user1 account

  const FORWARDER_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      'ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)',
    ),
  );
  if (nonce < 0 || nonce == undefined) {
    nonce = await teaFiTrustedForwarder.nonces(from);
  }
  const currentTime = await getCurrentBlockTimestamp();
  const deadline = currentTime + 15 * 60;
  const value = 0n;

  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint48', 'bytes32'],
      [FORWARDER_TYPEHASH, from.address, to, value, gas, nonce, deadline, ethers.keccak256(data)],
    ),
  );
  const digestFromContract = await teaFiTrustedForwarder.hashTypedDataV4(structHash);

  const { v, r, s } = ecsign(
    Buffer.from(digestFromContract.slice(2), 'hex'),
    Buffer.from(privateKey.slice(2), 'hex'),
  );

  const [rString, sString, vString] = [r.toString('hex'), s.toString('hex'), v.toString(16)];
  const sig = '0x' + rString + sString + vString;

  return {
    signature: sig,
    gas,
    deadline: '0x' + deadline.toString(16),
    value,
    data,
    from: from.address,
    to,
    r: rString,
    s: sString,
  };
};

export const getSignatureERC20Permit = async (
  erc20: ERC20WithContext,
  from: HardhatEthersSigner,
  permit2: IPermit2,
  nonce?: any,
) => {
  const accounts = config.networks.hardhat.accounts;
  const wallet = ethers.Wallet.fromPhrase(accounts.mnemonic); // Always using user1 account
  const privateKey = wallet.privateKey;

  const PERMIT_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)',
    ),
  );
  if (nonce < 0 || nonce == undefined) {
    nonce = await erc20.nonces(from);
  }
  const currentTime = await getCurrentBlockTimestamp();
  const deadline = currentTime + 15 * 60;

  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
      [
        PERMIT_TYPEHASH,
        from.address,
        await permit2.getAddress(),
        ethers.MaxUint256,
        nonce,
        deadline,
      ],
    ),
  );
  const digestFromContract = await erc20.hashTypedDataV4(structHash);

  const { v, r, s } = ecsign(
    Buffer.from(digestFromContract.slice(2), 'hex'),
    Buffer.from(privateKey.slice(2), 'hex'),
  );

  const [rString, sString, vString] = [r.toString('hex'), s.toString('hex'), v.toString(16)];
  const sig = '0x' + rString + sString + vString;

  return {
    signature: sig,
    from: from.address,
    v,
    r,
    s,
  };
};

export const getSignatureERC20PermitWithPrivateKey = async (
    erc20: ERC20WithContext,
    from: HardhatEthersSigner,
    permit2: IPermit2,
    privateKey: string,
    nonce?: any,
  ) => {
  
    const PERMIT_TYPEHASH = ethers.keccak256(
      ethers.toUtf8Bytes(
        'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)',
      ),
    );
    if (nonce < 0 || nonce == undefined) {
      nonce = await erc20.nonces(from);
    }
    const currentTime = await getCurrentBlockTimestamp();
    const deadline = currentTime + 15 * 60;
  
    const structHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
        [
          PERMIT_TYPEHASH,
          from.address,
          await permit2.getAddress(),
          ethers.MaxUint256,
          nonce,
          deadline,
        ],
      ),
    );
    const digestFromContract = await erc20.hashTypedDataV4(structHash);
  
    const { v, r, s } = ecsign(
      Buffer.from(digestFromContract.slice(2), 'hex'),
      Buffer.from(privateKey.slice(2), 'hex'),
    );
  
    const [rString, sString, vString] = [r.toString('hex'), s.toString('hex'), v.toString(16)];
    const sig = '0x' + rString + sString + vString;
  
    return {
      deadline,
      signature: sig,
      from: from.address,
      v,
      r,
      s,
    };
  };

export const permitSignatureBuilder = async (
  signer: HardhatEthersSigner | Wallet,
  permitSignatureDetails: PermitSingle,
  permit2Addr: string,
  chainId: BigNumberish,
) => {
  const { domain, types, values } = AllowanceTransfer.getPermitData(
    permitSignatureDetails,
    permit2Addr,
    Number(chainId),
  );
  const signatureOfPermit: string = await signer.signTypedData(domain, types, values);
  return {
    signatureOfPermit,
  };
};
