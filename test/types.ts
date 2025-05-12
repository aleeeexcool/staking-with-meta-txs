import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { AddressLike, BytesLike, HDNodeWallet, Wallet } from 'ethers';

export interface UnstakeParam {
  user: SignerWithAddress;
  operator: Wallet | HDNodeWallet | AddressLike;
  ids: bigint[];
  rewardsWithLoyalty: bigint[];
  deadline: bigint;
  nonce: bigint;
  v: bigint;
  r: BytesLike;
  s: BytesLike;
}

export interface OffChainStruct {
  token: AddressLike;
  from: AddressLike;
  to: AddressLike;
  deadline: bigint;
  v: bigint;
  r: BytesLike;
  s: BytesLike;
}
