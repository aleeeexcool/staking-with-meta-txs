import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { ecsign } from 'ethereumjs-util';
import { ContractTransactionResponse, HDNodeWallet, Wallet, ethers, keccak256 } from 'ethers';

import { TeaStaking } from '../types';
import { UnstakeParam } from './types';

export function calculateUserRewards(
  totalStakedTokens: bigint,
  totalUserStakedTokens: bigint,
  userStakedTokens: bigint,
  timePassed: bigint,
) {
  const rewardsPerShare = 237823439878234398n;

  const rateFromTotal = userStakedTokens / (totalUserStakedTokens / 10n ** 18n);
  const baseUserRate = totalUserStakedTokens / (totalStakedTokens / 10n ** 18n);
  return (timePassed * (rewardsPerShare * (rateFromTotal * baseUserRate))) / 10n ** 36n;
}

export function calculateDaysInSeconds(days: bigint) {
  return days * 24n * 60n * 60n;
}

export async function makeUnstakeCall(
  teaStaking: TeaStaking,
  user: SignerWithAddress,
  operator: Wallet | HDNodeWallet,
  ids: bigint[],
  rewardsWithLoyalty: bigint[],
): Promise<ContractTransactionResponse> {
  const signature = await getUnstakeSignature(teaStaking, user, operator, ids, rewardsWithLoyalty);
  const param: UnstakeParam = {
    user,
    operator,
    ids,
    rewardsWithLoyalty,
    ...signature,
  };

  return teaStaking.connect(user).unstake(param);
}

export async function makeClaimCall(
  teaStaking: TeaStaking,
  user: SignerWithAddress,
  operator: Wallet | HDNodeWallet,
  ids: bigint[],
  rewardsWithLoyalty: bigint[],
): Promise<ContractTransactionResponse> {
  const signature = await getClaimSignature(teaStaking, user, operator, ids, rewardsWithLoyalty);
  const param: UnstakeParam = {
    user,
    operator,
    ids,
    rewardsWithLoyalty,
    ...signature,
  };

  return teaStaking.connect(user).claim(param);
}

export async function getUnstakeSignature(
  teaStaking: TeaStaking,
  user: SignerWithAddress,
  operator: Wallet | HDNodeWallet,
  ids: bigint[],
  rewardsWithLoyalty: bigint[],
) {
  const [UNSTAKE_TYPEHASH, nonce] = await Promise.all([
    teaStaking.UNSTAKE_TYPEHASH(),
    teaStaking.operatorUserNonces(operator, user),
  ]);
  const deadline = BigInt(await time.latest()) + calculateDaysInSeconds(365n);

  const encodedData = keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256[]', 'uint256[]', 'uint256', 'uint256'],
      [UNSTAKE_TYPEHASH, user.address, ids, rewardsWithLoyalty, nonce, deadline],
    ),
  );

  const digest = await teaStaking.hashTypedDataV4(encodedData);

  const { v, r, s } = ecsign(
    Buffer.from(digest.slice(2), 'hex'),
    Buffer.from(operator.privateKey.slice(2), 'hex'),
  );

  const vBigInt = BigInt(v);
  const rHex = '0x' + r.toString('hex');
  const sHex = '0x' + s.toString('hex');

  return { nonce, deadline, v: vBigInt, r: rHex, s: sHex };
}

export async function getClaimSignature(
  teaStaking: TeaStaking,
  user: SignerWithAddress,
  operator: Wallet | HDNodeWallet,
  ids: bigint[],
  rewardsWithLoyalty: bigint[],
) {
  const [CLAIM_TYPEHASH, nonce] = await Promise.all([
    teaStaking.CLAIM_TYPEHASH(),
    teaStaking.operatorUserNonces(operator, user),
  ]);
  const deadline = BigInt(await time.latest()) + calculateDaysInSeconds(365n);
  console.log("CLAIM_TYPEHASH:" , CLAIM_TYPEHASH);
  const encodedData = keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256[]', 'uint256[]', 'uint256', 'uint256'],
      [CLAIM_TYPEHASH, user.address, ids, rewardsWithLoyalty, nonce, deadline],
    ),
  );

  const digest = await teaStaking.hashTypedDataV4(encodedData);

  const { v, r, s } = ecsign(
    Buffer.from(digest.slice(2), 'hex'),
    Buffer.from(operator.privateKey.slice(2), 'hex'),
  );

  const vBigInt = BigInt(v);
  const rHex = '0x' + r.toString('hex');
  const sHex = '0x' + s.toString('hex');

  return { nonce, deadline, v: vBigInt, r: rHex, s: sHex };
}
