import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import {
	TeaVesting,
	TestERC20,
	TestERC20__factory,
	TeaVesting__factory,
	TeaStaking__factory,
	TeaStaking,
} from '../types';
import { ethers, config } from 'hardhat';
import { expect } from 'chai';
import {
  BigNumberish,
	HDNodeWallet,
	Mnemonic,
	zeroPadBytes,
} from 'ethers';

import { ecsign } from 'ethereumjs-util';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { OffChainStruct } from './types';
import { makeUnstakeCall } from './utils';

async function getCurrentBlockTimestamp() {
  const block = await ethers.provider.getBlock('latest');
  return block?.timestamp as number;
}

export function getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
  }

async function increaseTimestamp(time: BigNumberish) {
	await ethers.provider.send("evm_increaseTime", [time]);
	await ethers.provider.send("evm_mine");
}

describe('TeaVesting', () => {
	const getSignatureOffChainOwnership = async(
		teaVesting: TeaVesting,
		from: HardhatEthersSigner,
		to: string,
		token: TestERC20,
		signerIndex: number
	) => {
		const accounts = config.networks.hardhat.accounts;
		const wallet = ethers.Wallet.fromPhrase(accounts.mnemonic); // Always using user1 account
		const privateKey = wallet.privateKey;
		const TRANSFER_OWNER_TYPEHASH = 
			'0x33c8deca30830df19b44e9ca8b7b53a5c4dc23e1161fc88d6f7e6954c4f54a9f';
		const nonce = await teaVesting.nonces(from);
		const currentTime = await getCurrentBlockTimestamp();
		const deadline = currentTime + 15 * 60;
		const structHash = ethers.keccak256(
			ethers.AbiCoder.defaultAbiCoder().encode(
				[
					'bytes32',
					'address',
					'address',
					'address',
					'uint256',
					'uint256',
				],
				[
					TRANSFER_OWNER_TYPEHASH,
					await token.getAddress(),
					from.address,
					to,
					nonce,
					deadline,
				],
			),
		);
		const digestFromContract = await teaVesting.hashTypedDataV4(structHash);
		const { v, r, s } = ecsign(
			Buffer.from(digestFromContract.slice(2), "hex"),
			Buffer.from(privateKey.slice(2), "hex")
		);

		return {
				token: await token.getAddress(),
				from: from.address,
				to: to,
				deadline: '0x' + deadline.toString(16),
				v: BigInt(v),
				r: '0x' + r.toString('hex'),
				s: '0x' + s.toString('hex'),
			};
	}

	let teaVesting: TeaVesting;
	let teaStaking: TeaStaking;
  let teaToken: TestERC20;
	let presaleTeaTokenA: TestERC20;
	let presaleTeaTokenB: TestERC20;
	let presaleTeaTokenC: TestERC20;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let user3: HardhatEthersSigner;
	let user4: HardhatEthersSigner;
	let operator: HDNodeWallet;
	let ownerVesting: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let deployer: HardhatEthersSigner;
  let accounts: HardhatEthersSigner[];
	let thousand = ethers.parseEther('1000');
	let million = ethers.parseEther('1000000');
	let threeMillion = ethers.parseEther('3000000');
	let baseAllocationX2 = ethers.parseEther('15000000');
	let ONE_MONTH = 2629800;
	let INITIAL_PERCENT = [100n, 200n, 500n]; // [10%, 20%, 50%];
	let baseAllocation = ethers.parseEther('7500000');
	let currentTimestamp: BigNumberish;
	let nextMonth: BigNumberish;


  it('Setup core contract', async () => {
    [
			user1,
			user2,
			user3,
			user4,
			ownerVesting,
			treasury,
			deployer,
			...accounts
		] = await ethers.getSigners();

		const mnemonic = Mnemonic.fromPhrase(
      'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat',
    );
		operator = HDNodeWallet.fromMnemonic(mnemonic);

		presaleTeaTokenA = await new TestERC20__factory(deployer).deploy(million);
		presaleTeaTokenB = await new TestERC20__factory(deployer).deploy(million);
		presaleTeaTokenC = await new TestERC20__factory(deployer).deploy(million);
		teaToken = await new TestERC20__factory(deployer).deploy(baseAllocationX2);

		currentTimestamp = await getCurrentBlockTimestamp() + 100;
		nextMonth = currentTimestamp + ONE_MONTH;
		teaVesting = await new TeaVesting__factory(deployer).deploy(
			'TeaVesting', 																					// _name 
			ownerVesting.address, 																	// _initialOwner
			teaToken, 																							// _tea
			treasury, 																							// _treasury
			deployer, 																							// _trustedForwarder
			[presaleTeaTokenA, presaleTeaTokenB, presaleTeaTokenC], // _tokenAddrs
			[currentTimestamp, currentTimestamp, currentTimestamp], // _dataStarts
			[nextMonth, nextMonth, nextMonth], 											// _dataEnds
			INITIAL_PERCENT 																				// _percentUnlocks 10% = 100
		);

		teaStaking = await new TeaStaking__factory(deployer).deploy(
			deployer,
			deployer,
			[operator.address],
			deployer.address,
			await teaVesting.getAddress(),
			await teaToken.getAddress(),
			[await presaleTeaTokenA.getAddress(), await presaleTeaTokenB.getAddress()],
		);
		
		await teaToken.connect(deployer).approve(teaStaking, baseAllocation);
		await teaStaking.connect(deployer).initializeStaking(baseAllocation, await time.latest());
		const teaStakingAddress = await teaStaking.getAddress();
		
		await teaToken.connect(deployer).transfer(treasury, threeMillion);
		await teaToken.connect(treasury).approve(teaVesting, threeMillion);

		await presaleTeaTokenA.connect(deployer).approve(teaStakingAddress, threeMillion);
		await presaleTeaTokenB.connect(deployer).approve(teaStakingAddress, threeMillion);

  });


	it('Transfer presale tokens to users', async()=>{
		await Promise.all([
			presaleTeaTokenA.connect(deployer).transfer(user1, thousand),
			presaleTeaTokenB.connect(deployer).transfer(user2, thousand),
			presaleTeaTokenC.connect(deployer).transfer(user3, thousand),
		]);
		const [
			balanceUser1,
			balanceUser2,
			balanceUser3
		] = await Promise.all([
			presaleTeaTokenA.balanceOf(user1),
			presaleTeaTokenB.balanceOf(user2),
			presaleTeaTokenC.balanceOf(user3),
		]);
		expect(balanceUser1).to.equal(thousand);
		expect(balanceUser2).to.equal(thousand);
		expect(balanceUser3).to.equal(thousand);
	})

	it('Vest token', async()=>{
		await Promise.all([
			presaleTeaTokenA.connect(user1).approve(teaVesting, thousand),
			presaleTeaTokenB.connect(user2).approve(teaVesting, thousand),
			presaleTeaTokenC.connect(user3).approve(teaVesting, thousand),
		]);

		await increaseTimestamp(100);

		await Promise.all([
			teaVesting.connect(user1).vest(presaleTeaTokenA, thousand),
			teaVesting.connect(user2).vest(presaleTeaTokenB, thousand),
			teaVesting.connect(user3).vest(presaleTeaTokenC, thousand),
		]);
		const [
			vestingDataUser1,
			vestingDataUser2,
			vestingDataUser3
		] = await Promise.all([
			teaVesting.getVestingUsers(user1, presaleTeaTokenA),
			teaVesting.getVestingUsers(user2, presaleTeaTokenB),
			teaVesting.getVestingUsers(user3, presaleTeaTokenC),
		])

		const balanceWithoutInitialClaimUser1 = vestingDataUser1[0] - vestingDataUser1[1];
		const balanceWithoutInitialClaimUser2 = vestingDataUser2[0] - vestingDataUser2[1];
		const balanceWithoutInitialClaimUser3 = vestingDataUser3[0] - vestingDataUser3[1];

		const initialClaimUser1 = thousand * INITIAL_PERCENT[0] / 1000n;
		const initialClaimUser2 = thousand * INITIAL_PERCENT[1] / 1000n;
		const initialClaimUser3 = thousand * INITIAL_PERCENT[2] / 1000n;

		const [
			balanceUser1,
			balanceUser2,
			balanceUser3,
		] = await Promise.all([
			teaToken.balanceOf(user1),
			teaToken.balanceOf(user2),
			teaToken.balanceOf(user3),
		]);

		expect(vestingDataUser1[1]).to.equal(balanceUser1 - initialClaimUser1);
		expect(vestingDataUser2[1]).to.equal(balanceUser2 - initialClaimUser2);
		expect(vestingDataUser3[1]).to.equal(balanceUser3 - initialClaimUser3);

		expect(balanceWithoutInitialClaimUser1 + balanceUser1).to.equal(thousand);
		expect(balanceWithoutInitialClaimUser2 + balanceUser2).to.equal(thousand);
		expect(balanceWithoutInitialClaimUser3 + balanceUser3).to.equal(thousand);

	});


	it('Stake vested tokens', async()=>{
		const tokenToStaking = ethers.parseEther('800');
		const transferOwnerShipSig = await getSignatureOffChainOwnership(
			teaVesting,
			user1,
			await teaStaking.getAddress(),
			presaleTeaTokenA,
			1
		);

		await teaStaking.connect(user1).stake(
			[await presaleTeaTokenA.getAddress()],
			[tokenToStaking],
			[transferOwnerShipSig]
		);

		expect((await teaStaking.stakes(1))[2]).to.equal(tokenToStaking);
	});


	it('Try to withdraw by ownership and presaleTokens', async() => {
		const claimBefore = await teaVesting.getVestingUsers(user1, presaleTeaTokenA);
		const rewards = [15000n * 10n ** 18n];
		await time.increase(86400 * 368);

		const unstakeBefore = await teaStaking.stakes(1);
		await makeUnstakeCall(teaStaking, user1, operator, [1n], [rewards[0]]);
		const unstakeAfter = await teaStaking.stakes(1);

		await teaStaking.connect(user1).withdraw([1]);

		const claimAfter = await teaVesting.getVestingUsers(user1, presaleTeaTokenA);
		const userBalanceAfter = await teaToken.balanceOf(user1);

		const unstakedTokenAmount = thousand - ethers.parseEther('800'); // 200

		expect(userBalanceAfter - unstakedTokenAmount).to.eq(unstakeAfter[3] + unstakeAfter[4]);
		expect(claimBefore[0]).to.eq(claimAfter[1])
	});
});