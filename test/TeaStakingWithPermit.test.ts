import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import {
	TeaVesting,
	TestERC20,
	TestERC20__factory,
	TeaVesting__factory,
	TeaStaking__factory,
	TeaStaking,
    IPermit2,
} from '../types';
import { ethers, config } from 'hardhat';
import { expect } from 'chai';
import {
  BigNumberish,
	Block,
	HDNodeWallet,
	Mnemonic,
	Wallet,
	zeroPadBytes,
} from 'ethers';

import { ecsign } from 'ethereumjs-util';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { OffChainStruct } from './types';
import { makeClaimCall, makeUnstakeCall } from './utils';
import { PermitSingle } from '@uniswap/permit2-sdk';
import { getSignatureERC20Permit, getSignatureERC20PermitWithPrivateKey, permitSignatureBuilder } from './utils-signature-builder';

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
const permit2Addr = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const binanceHotWalletPrivateKey =
'201e01fe8ada9d1133ca5f108ddf860586fa05987653fc6d29998df7ba6c2245';
const binanceHotWalletAddress = '0xC1e0D8160587D9eae491CC59aD7f0ceAB5433Bfd';
let binanceHotWalletHolderAddr = '0xF977814e90dA44bFA03b6295A0616a897441aceC';


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

    let permit2: IPermit2;
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
    let binanceHotWallet: HardhatEthersSigner;
    let binanceHotWalletHolder: HardhatEthersSigner;
    let binanceWalletSigner: Wallet;

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
        permit2 = await ethers.getContractAt('IPermit2', permit2Addr);
		currentTimestamp = await getCurrentBlockTimestamp() + 100;
		nextMonth = currentTimestamp + ONE_MONTH;
		teaVesting = await new TeaVesting__factory(deployer).deploy(
			'TeaVesting', 														// _name 
			ownerVesting.address, 												// _initialOwner
			teaToken, 															// _tea
			treasury, 															// _treasury
			deployer, 															// _trustedForwarder
			[presaleTeaTokenA, presaleTeaTokenB, presaleTeaTokenC],             // _tokenAddrs
			[currentTimestamp, currentTimestamp, currentTimestamp],             // _dataStarts
			[nextMonth, nextMonth, nextMonth], 							        // _dataEnds
			INITIAL_PERCENT 													// _percentUnlocks 10% = 100
		);

		teaStaking = await new TeaStaking__factory(deployer).deploy(
			deployer,
			deployer,
			[operator.address],
			deployer.address,
			await teaVesting.getAddress(),
			await teaToken.getAddress(),
			[await presaleTeaTokenA.getAddress(), await presaleTeaTokenB.getAddress()],
            permit2Addr
		);
		
		await teaToken.connect(deployer).approve(teaStaking, baseAllocation);
		await teaStaking.connect(deployer).initializeStaking(baseAllocation, await time.latest());
		const teaStakingAddress = await teaStaking.getAddress();
		
		await teaToken.connect(deployer).transfer(treasury, threeMillion);
		await teaToken.connect(treasury).approve(teaVesting, threeMillion);

		await presaleTeaTokenA.connect(deployer).approve(teaStakingAddress, threeMillion);
		await presaleTeaTokenB.connect(deployer).approve(teaStakingAddress, threeMillion);

        binanceHotWallet = await ethers.getImpersonatedSigner(binanceHotWalletAddress);
        binanceHotWalletHolder = await ethers.getImpersonatedSigner(binanceHotWalletHolderAddr);
        binanceWalletSigner = new ethers.Wallet(binanceHotWalletPrivateKey);

        await deployer.sendTransaction({
            value: ethers.parseEther('1'),
            to: binanceHotWallet.address,
          });
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

    it('Stake token with permit2', async()=> {
        const amountToStake = ethers.parseEther('800');

        const currentTimestamp = await ethers.provider
        .getBlock('latest')
        .then(block => (block as Block).timestamp);

        const deadline = currentTimestamp + 10000;
        const { chainId } = await ethers.provider.getNetwork();

        await teaToken.connect(deployer).transfer(binanceHotWallet.address, amountToStake);

        const param: OffChainStruct = {
            token: await teaToken.getAddress(),
            from: binanceHotWallet.address,
            to: await teaStaking.getAddress(),
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };

        await teaToken.connect(binanceHotWallet).approve(permit2Addr, ethers.MaxInt256);
        await permit2
        .connect(binanceHotWallet)
        .approve(
          await teaToken.getAddress(),
          await teaStaking.getAddress(),
          amountToStake,
          await time.latest() + 10000,
        );

        const permitSignatureDetails: PermitSingle = {
            details: {
              token: await teaToken.getAddress(),
              amount: amountToStake,
              expiration: deadline,
              nonce: 0n, //(await permit2.allowance(binanceHotWallet.address, await pepe.getAddress(), await proxyTrade.getAddress()))[0],
            },
            spender: await teaStaking.getAddress(),
            sigDeadline: deadline,
          };

        const { signatureOfPermit } = await permitSignatureBuilder(
          binanceWalletSigner, // binanceWalletSigner == binanceHotWallet,
          permitSignatureDetails,
          permit2Addr,
          chainId,
        );
        await teaStaking.connect(binanceHotWallet).stake(
          [await teaToken.getAddress()],
          [amountToStake],
          [param],
          permitSignatureDetails,
          signatureOfPermit,
          );

        const stakeData = await teaStaking.getTotalUserStakedTokens(binanceHotWallet.address);
        expect(stakeData).to.equal(BigInt(amountToStake));
    })

    it('Stake token with TWO permit2', async()=> {
        const amountToStake = ethers.parseEther('800');
    
        const currentTimestamp = await ethers.provider
        .getBlock('latest')
        .then(block => (block as Block).timestamp);

        const deadline = currentTimestamp + 10000;
        const { chainId } = await ethers.provider.getNetwork();

        await teaToken.connect(deployer).transfer(binanceHotWallet.address, amountToStake);

        const param: OffChainStruct = {
            token: await teaToken.getAddress(),
            from: binanceHotWallet.address,
            to: await teaStaking.getAddress(),
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };

        const permitSignatureDetails: PermitSingle = {
            details: {
              token: await teaToken.getAddress(),
              amount: amountToStake,
              expiration: deadline,
              nonce: 0n,
            },
            spender: await teaStaking.getAddress(),
            sigDeadline: deadline,
          };

        const { signatureOfPermit } = await permitSignatureBuilder(
          binanceWalletSigner, // binanceWalletSigner == binanceHotWallet,
          permitSignatureDetails,
          permit2Addr,
          chainId,
        );

        const signatureOfErc20Permit = await getSignatureERC20PermitWithPrivateKey(
            teaToken,
            binanceHotWallet,
            permit2,
            '0x' + binanceHotWalletPrivateKey,
        );

        const tokenPermitSignatureDetails = {
            deadline: signatureOfErc20Permit.deadline,
            v: signatureOfErc20Permit.v,
            r: signatureOfErc20Permit.r,
            s: signatureOfErc20Permit.s,
        };

        await teaStaking.connect(binanceHotWallet).stake(
          [await teaToken.getAddress()],
          [amountToStake],
          [param],
          permitSignatureDetails,
          signatureOfPermit,
          tokenPermitSignatureDetails
        );

        const stakeData = await teaStaking.getTotalUserStakedTokens(binanceHotWallet.address);
        expect(stakeData).to.equal(BigInt(amountToStake * 2n));
    })

	it('Try to withdraw by ownership and presaleTokens', async() => {
        const amountToStake = ethers.parseEther('800');

        console.log(await teaStaking.getUserIds(binanceHotWallet), 'getUserIds');

		await time.increase(86400 * 368);


        const stake1 = await teaStaking.getPendingRewards(1);
        const stake2 = await teaStaking.getPendingRewards(2);

        await makeClaimCall(
            teaStaking,
            binanceHotWallet,
            operator,
            [1n],
            [stake1]
        );

        await makeClaimCall(
            teaStaking,
            binanceHotWallet,
            operator,
            [2n],
            [stake2]
        );

    
        expect(stake2 + stake1).to.lte(baseAllocation); // 7500000

        const balanceUnstakeBefore = await teaToken.balanceOf(binanceHotWallet.address);
        await makeUnstakeCall(
            teaStaking,
            binanceHotWallet,
            operator,
            [1n, 2n],
            [0n, 0n]
        );


        await time.increase(86400 * 14);
		await teaStaking.connect(binanceHotWallet).withdraw([1n, 2n]);
        const balanceWithdrawAfter = await teaToken.balanceOf(binanceHotWallet.address); // 800 + 800

        expect(balanceWithdrawAfter - balanceUnstakeBefore).to.eq(amountToStake* 2n);

	});
});