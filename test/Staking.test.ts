import { time } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { HDNodeWallet, Mnemonic, ZeroAddress, ZeroHash, zeroPadBytes } from 'ethers';
import { ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';

import { OffChainStruct, UnstakeParam } from './types';
import {
  calculateDaysInSeconds,
  calculateUserRewards,
  getUnstakeSignature,
  makeUnstakeCall,
} from './utils';
import { IPermit2 } from '../types';


const permit2Addr = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

describe('Unit tests', function () {
  beforeEach(async function () {
    this.permit2 = await ethers.getContractAt('IPermit2', permit2Addr);
    const { deployer } = await getNamedAccounts();
    const unnamedAccounts = await getUnnamedAccounts();
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const MockTeaVesting = await ethers.getContractFactory('MockTeaVesting');

    const baseAllocation = ethers.parseEther('7500000');

    this.signers = {};
    this.users = [];
    this.operator = {};
    this.testContracts = {};

    this.signers.deployer = await ethers.getSigner(deployer);
    this.signers.accounts = await Promise.all(
      unnamedAccounts.map(address => ethers.getSigner(address)),
    );
    this.users = [this.signers.deployer, ...this.signers.accounts];
    const mnemonic = Mnemonic.fromPhrase(
      'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat',
    );
    this.operator = HDNodeWallet.fromMnemonic(mnemonic);

    const presale_token_1 = await MockERC20.deploy('Presale 1', 'PS1');
    await presale_token_1.waitForDeployment();
    const presale_token_1_address = await presale_token_1.getAddress();

    const presale_token_2 = await MockERC20.deploy('Presale 2', 'PS2');
    await presale_token_2.waitForDeployment();
    const presale_token_2_address = await presale_token_2.getAddress();

    const tea_token = await MockERC20.deploy('Tea Token', 'TEA');
    await tea_token.waitForDeployment();
    const tea_token_address = await tea_token.getAddress();

    const tea_vesting = await MockTeaVesting.deploy(tea_token_address, [
      presale_token_1_address,
      presale_token_2_address,
    ]);
    await tea_vesting.waitForDeployment();
    const tea_vesting_address = await tea_vesting.getAddress();

    const teaStaking = await ethers.getContractFactory('TeaStaking');
    this.contract = await teaStaking.deploy(
      this.signers.deployer.address,
      this.signers.deployer.address,
      [this.operator.address],
      this.signers.deployer.address,
      tea_vesting_address,
      tea_token_address,
      [presale_token_1_address, presale_token_2_address],
      permit2Addr
    );
    await this.contract.waitForDeployment();

    const amountToMint = ethers.parseEther('7500000');
    await tea_token.mint(this.signers.deployer.address, amountToMint);
    await tea_token.mint(this.contract, amountToMint);
    await tea_token.mint(tea_vesting, amountToMint * 3n);

    await this.contract.initializeStaking(baseAllocation, await time.latest());

    const users = [this.users[1], this.users[2], this.users[3], this.users[4], this.users[5]];
    for (const user of users) {
      await presale_token_1.mint(user, ethers.parseEther('2000000'));
      await tea_vesting.vest(presale_token_1_address, user);
      await tea_token.mint(user, ethers.parseEther('2000000'));
    }

    this.testContracts = {
      presale_token_1,
      presale_token_2,
      tea_token,
      tea_vesting,
    };
  });

  context('TeaStaking', function () {
    context('deployment', function () {
      it('should have correct initial addresses setup', async function () {
        const staking = this.contract;
        const { presale_token_1, tea_token, tea_vesting, presale_token_2 } = this.testContracts;

        expect(await staking.teaVesting()).to.be.equal(tea_vesting);
        expect(await staking.teaToken()).to.be.equal(tea_token);
        expect(await staking.checkTokenValidity(presale_token_1)).to.be.equal(true);
        expect(await staking.checkTokenValidity(presale_token_2)).to.be.equal(true);
      });

      it('should revert when any of presale tokens is not valid', async function () {
        const { presale_token_1, tea_token, tea_vesting } = this.testContracts;

        const stakingFactory = await ethers.getContractFactory('TeaStaking');
        const staking = stakingFactory.deploy(
          this.signers.deployer.address,
          this.signers.deployer.address,
          [this.operator.address],
          this.signers.deployer.address,
          tea_vesting,
          tea_token,
          [presale_token_1, tea_token],
          permit2Addr,
        );

        let abi = ['error OnlyValidToken()'];
        let iface = new ethers.Interface(abi);

        await expect(staking).to.be.revertedWithCustomError({ interface: iface }, 'OnlyValidToken');
      });

      it('should revert when any address is zero', async function () {
        const { presale_token_1, tea_token, presale_token_2, tea_vesting } = this.testContracts;

        const stakingFactory = await ethers.getContractFactory('TeaStaking');
        const staking = stakingFactory.deploy(
          this.signers.deployer.address,
          this.signers.deployer.address,
          [ZeroAddress],
          this.signers.deployer.address,
          tea_vesting,
          tea_token,
          [presale_token_1, presale_token_2],
          permit2Addr
        );

        let abi = ['error NoZeroAddress()'];
        let iface = new ethers.Interface(abi);

        await expect(staking).to.be.revertedWithCustomError({ interface: iface }, 'NoZeroAddress');

        const stakingFactory2 = await ethers.getContractFactory('TeaStaking');
        const staking2 = stakingFactory2.deploy(
          this.signers.deployer.address,
          this.signers.deployer.address,
          [this.operator.address],
          this.signers.deployer.address,
          ZeroAddress,
          tea_token,
          [presale_token_1, presale_token_2],
          permit2Addr
        );

        await expect(staking2).to.be.revertedWithCustomError({ interface: iface }, 'NoZeroAddress');

        const stakingFactory3 = await ethers.getContractFactory('TeaStaking');
        const staking3 = stakingFactory3.deploy(
          this.signers.deployer.address,
          this.signers.deployer.address,
          [this.operator.address],
          this.signers.deployer.address,
          tea_vesting,
          tea_token,
          [ZeroAddress, presale_token_2],
          permit2Addr
        );

        await expect(staking3).to.be.revertedWithCustomError({ interface: iface }, 'NoZeroAddress');
      });

      it('should revert with custom error WrongDecimalNumber if decimals are different', async function () {
        const { presale_token_1, tea_token, presale_token_2, tea_vesting } = this.testContracts;

        await presale_token_1.setDecimals(17);

        const stakingFactory = await ethers.getContractFactory('TeaStaking');
        const staking = stakingFactory.deploy(
          this.signers.deployer.address,
          this.signers.deployer.address,
          [this.operator.address],
          this.signers.deployer.address,
          tea_vesting,
          tea_token,
          [presale_token_1, presale_token_2],
          permit2Addr
        );

        let abi = ['error WrongDecimalNumber()'];
        let iface = new ethers.Interface(abi);

        await expect(staking).to.be.revertedWithCustomError(
          { interface: iface },
          'WrongDecimalNumber',
        );

        const stakingFactory2 = await ethers.getContractFactory('TeaStaking');
        const staking2 = stakingFactory2.deploy(
          this.signers.deployer.address,
          this.signers.deployer.address,
          [this.operator.address],
          this.signers.deployer.address,
          tea_vesting,
          tea_token,
          [presale_token_2, presale_token_1],
          permit2Addr
        );

        await expect(staking2).to.be.revertedWithCustomError(
          { interface: iface },
          'WrongDecimalNumber',
        );
      });
    });

    context('initializeStaking()', function () {
      context('when admin wants to initialize staking one more time', function () {
        it('should revert with custom error StakingAlreadyInitialized', async function () {
          const staking = this.contract;

          const initializeTx = staking.initializeStaking(0n, 0n);
          await expect(initializeTx).to.be.revertedWithCustomError(
            staking,
            'StakingAlreadyInitialized',
          );
        });
      });

      context('when user wants to initialize staking', function () {
        it('should revert with custom error AccessControlUnauthorizedAccount', async function () {
          const staking = this.contract;

          const initializeTx = staking.connect(this.users[1]).initializeStaking(0n, 0n);
          await expect(initializeTx).to.be.revertedWithCustomError(
            staking,
            'AccessControlUnauthorizedAccount',
          );
        });
      });

      context('when admin wants to reinitialize staking after 1 year passed', function () {
        it('should allow reinitialize staking successfully and emit StakingInitialized', async function () {
          const staking = this.contract;
          const baseAllocation = ethers.parseEther('7500000');
          const { presale_token_1, tea_token } = this.testContracts;
          const amountToStake = ethers.parseEther('50000');
          const vipStake = ethers.parseEther('1000001');
          const param: OffChainStruct = {
            token: tea_token,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };
          const param2: OffChainStruct = {
            token: presale_token_1,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };
          const rewards = [15000n * 10n ** 18n];

          await staking.connect(this.users[1]).stake([presale_token_1], [amountToStake], [param2]);

          await time.increase(86400 * 368);
          await staking.updateRewardPerShare();

          await tea_token.mint(this.signers.deployer.address, ethers.parseEther('7500000'));

          const initializeTx = staking.initializeStaking(baseAllocation, await time.latest());
          await expect(initializeTx).to.emit(staking, 'StakingInitialized');

          await tea_token.connect(this.users[2]).approve(permit2Addr, ethers.MaxInt256);
          await tea_token.connect(this.users[3]).approve(permit2Addr, ethers.MaxInt256);

          await this.permit2
          .connect(this.users[2])
          .approve(
            await tea_token.getAddress(),
            await staking.getAddress(),
            baseAllocation,
            await time.latest() + 10000,
          );

          await this.permit2
          .connect(this.users[3])
          .approve(
            await tea_token.getAddress(),
            await staking.getAddress(),
            baseAllocation,
            await time.latest() + 10000,
          );

          await staking.connect(this.users[1]).stake([presale_token_1], [amountToStake], [param2]);
          await staking.connect(this.users[2]).stake([tea_token], [amountToStake], [param]);
          await staking.connect(this.users[3]).stake([tea_token], [vipStake], [param]);

          // 15 days passed
          await time.increase(86400 * 15);

          // User1 decided to unstake his stake
          await makeUnstakeCall(staking, this.users[1], this.operator, [1n], [rewards[0]]);

          // Check User1 changes
          expect(await staking.getTotalUserStakedTokens(this.users[1])).to.be.equal(amountToStake);
          expect(await staking.totalStakedTokens()).to.equal(ethers.parseEther('1100001'));
          expect(await staking.getUserIds(this.users[1].address)).to.deep.equal([1n, 2n]);
        });
      });
    });

    context('emergencyWithdraw()', function () {
      it('should allow admin to emergency withdraw', async function () {
        const staking = this.contract;
        const { tea_token } = this.testContracts;
        const amountToStake = ethers.parseEther('5000');

        const param: OffChainStruct = {
          token: tea_token,
          from: this.users[1].address,
          to: staking,
          deadline: 0n,
          v: 0n,
          r: zeroPadBytes('0x', 32),
          s: zeroPadBytes('0x', 32),
        };

        await tea_token.connect(this.users[1]).approve(permit2Addr, ethers.MaxInt256);

        await this.permit2
        .connect(this.users[1])
        .approve(
          await tea_token.getAddress(),
          await staking.getAddress(),
          amountToStake,
          await time.latest() + 10000,
        );

        await staking.connect(this.users[1]).stake([tea_token], [amountToStake], [param]);

        const withdrawalTx = staking.connect(this.signers.deployer).emergencyWithdraw();

        await expect(withdrawalTx).to.changeTokenBalances(
          tea_token,
          [staking, this.signers.deployer],
          [-ethers.parseEther('7500000') * 2n, ethers.parseEther('7500000') * 2n],
        );
      });

      it('should revert custom error AccessControlUnauthorizedAccount', async function () {
        const staking = this.contract;

        const withdrawalTx = staking.connect(this.users[5]).emergencyWithdraw();

        expect(withdrawalTx).to.be.revertedWithCustomError(
          staking,
          'AccessControlUnauthorizedAccount',
        );
      });
    });

    context('stake()', function () {
      context('when user puts correct values', function () {
        it('should allow user1 stakes successfully', async function () {
          const staking = this.contract;
          const { presale_token_1, tea_token } = this.testContracts;
          const amountToStake = ethers.parseEther('5000');
          const param: OffChainStruct = {
            token: presale_token_1,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };
          const param2: OffChainStruct = {
            token: tea_token,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };
          

          const stakeTx = staking
            .connect(this.users[1])
            .stake([presale_token_1], [amountToStake], [param]);

          await expect(stakeTx).to.changeTokenBalances(
            presale_token_1,
            [this.users[1], staking],
            [0, 0],
          );

          expect(await staking.totalStakedTokens()).to.equal(amountToStake);

          await tea_token.connect(this.users[1]).approve(permit2Addr, ethers.MaxInt256);

          await this.permit2
          .connect(this.users[1])
          .approve(
            await tea_token.getAddress(),
            await staking.getAddress(),
            amountToStake,
            await time.latest() + 10000,
          );

          const stakeTx2 = staking
            .connect(this.users[1])
            .stake([tea_token], [amountToStake], [param2]);

          await expect(stakeTx2).to.changeTokenBalances(
            tea_token,
            [this.users[1], staking],
            [-amountToStake, amountToStake],
          );

          expect(await staking.totalStakedTokens()).to.equal(amountToStake * 2n);
        });

        it('should emit Stake event', async function () {
          const staking = this.contract;
          const { presale_token_1 } = this.testContracts;
          const amountToStake = ethers.parseEther('5000');
          const param: OffChainStruct = {
            token: presale_token_1,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };

          const stakeTx = staking
            .connect(this.users[1])
            .stake([presale_token_1], [amountToStake], [param]);

          await expect(stakeTx)
            .to.be.emit(staking, 'Staked')
            .withArgs(this.users[1], 1n, presale_token_1, amountToStake);
        });
      });

      context('when user puts incorrect values', function () {
        context('when user puts zero as an amount argument', function () {
          it('should revert custom error NoZeroAmount', async function () {
            const staking = this.contract;
            const { presale_token_1 } = this.testContracts;
            const param: OffChainStruct = {
              token: presale_token_1,
              from: this.users[1].address,
              to: staking,
              deadline: 0n,
              v: 0n,
              r: zeroPadBytes('0x', 32),
              s: zeroPadBytes('0x', 32),
            };

            const stakeTx = staking.connect(this.users[1]).stake([presale_token_1], [0], [param]);

            await expect(stakeTx).to.be.revertedWithCustomError(staking, 'NoZeroAmount');
          });
        });

        context('when user puts not valid address of token as an address argument', function () {
          it('should revert custom error OnlyValidToken', async function () {
            const staking = this.contract;
            const { presale_token_1 } = this.testContracts;
            const param: OffChainStruct = {
              token: presale_token_1,
              from: this.users[1].address,
              to: staking,
              deadline: 0n,
              v: 0n,
              r: zeroPadBytes('0x', 32),
              s: zeroPadBytes('0x', 32),
            };

            const stakeTx = staking
              .connect(this.users[1])
              .stake([this.users[2].address], [1n], [param]);

            await expect(stakeTx).to.be.revertedWithCustomError(staking, 'OnlyValidToken');
          });
        });

        context(
          'when addresses provided does not match the addresses in offChain struct',
          function () {
            it('should revert custom error AddressesMismatch', async function () {
              const staking = this.contract;
              const { presale_token_1, tea_token } = this.testContracts;
              const param: OffChainStruct = {
                token: tea_token,
                from: this.users[1].address,
                to: staking,
                deadline: 0n,
                v: 0n,
                r: zeroPadBytes('0x', 32),
                s: zeroPadBytes('0x', 32),
              };
              const param2: OffChainStruct = {
                token: presale_token_1,
                from: this.users[1].address,
                to: presale_token_1,
                deadline: 0n,
                v: 0n,
                r: zeroPadBytes('0x', 32),
                s: zeroPadBytes('0x', 32),
              };

              const stakeTx = staking
                .connect(this.users[1])
                .stake([presale_token_1], [1n], [param]);

              await expect(stakeTx).to.be.revertedWithCustomError(staking, 'AddressesMismatch');

              const stakeTx2 = staking
                .connect(this.users[1])
                .stake([presale_token_1], [1n], [param2]);

              await expect(stakeTx2).to.be.revertedWithCustomError(staking, 'AddressesMismatch');
            });
          },
        );

        context("when user doesn't have enough vested tokens", function () {
          it('should revert custom error NotEnoughLockedTokens', async function () {
            const staking = this.contract;
            const { presale_token_1 } = this.testContracts;
            const param: OffChainStruct = {
              token: presale_token_1,
              from: this.users[1].address,
              to: staking,
              deadline: 0n,
              v: 0n,
              r: zeroPadBytes('0x', 32),
              s: zeroPadBytes('0x', 32),
            };

            const stakeTx = staking.connect(this.users[6]).stake([presale_token_1], [1n], [param]);

            await expect(stakeTx).to.be.revertedWithCustomError(staking, 'NotEnoughLockedTokens');
          });
        });

        context("when staking doesn't start yet", function () {
          it('should revert custom error StakingNotActive', async function () {
            const staking = this.contract;
            const { presale_token_1, tea_token } = this.testContracts;

            const param: OffChainStruct = {
              token: presale_token_1,
              from: this.users[1].address,
              to: staking,
              deadline: 0n,
              v: 0n,
              r: zeroPadBytes('0x', 32),
              s: zeroPadBytes('0x', 32),
            };

            await staking.connect(this.users[1]).stake([presale_token_1], [1n], [param]);
            await time.increase(86400 * 365);

            await staking.updateRewardPerShare();

            await tea_token.mint(this.signers.deployer.address, ethers.parseEther('7500000'));

            await this.contract.initializeStaking(
              ethers.parseEther('7500000'),
              (await time.latest()) + 86400 * 7,
            );

            const stakeTx = staking.connect(this.users[1]).stake([presale_token_1], [1n], [param]);

            await expect(stakeTx).to.be.revertedWithCustomError(staking, 'StakingNotActive');
          });
        });

        context('when staking has already ended', function () {
          it('should revert custom error StakingNotActive', async function () {
            const staking = this.contract;
            const { presale_token_1 } = this.testContracts;
            const param: OffChainStruct = {
              token: presale_token_1,
              from: this.users[1].address,
              to: staking,
              deadline: 0n,
              v: 0n,
              r: zeroPadBytes('0x', 32),
              s: zeroPadBytes('0x', 32),
            };

            await time.increase(86400 * 365);

            const stakeTx = staking.connect(this.users[1]).stake([presale_token_1], [1n], [param]);

            await expect(stakeTx).to.be.revertedWithCustomError(staking, 'StakingNotActive');
          });
        });
      });
    });

    context('unstake()', function () {
      beforeEach(async function () {
        const staking = this.contract;
        const { presale_token_1, tea_token } = this.testContracts;
        const amountToStake = ethers.parseEther('50000');
        const vipStake = ethers.parseEther('1000001');
        const param: OffChainStruct = {
          token: presale_token_1,
          from: this.users[1].address,
          to: staking,
          deadline: 0n,
          v: 0n,
          r: zeroPadBytes('0x', 32),
          s: zeroPadBytes('0x', 32),
        };
        const param2: OffChainStruct = {
          token: tea_token,
          from: this.users[1].address,
          to: staking,
          deadline: 0n,
          v: 0n,
          r: zeroPadBytes('0x', 32),
          s: zeroPadBytes('0x', 32),
        };

        await tea_token.connect(this.users[2]).approve(permit2Addr, ethers.MaxInt256);
        await tea_token.connect(this.users[3]).approve(permit2Addr, ethers.MaxInt256);

        await this.permit2
        .connect(this.users[2])
        .approve(
          await tea_token.getAddress(),
          await staking.getAddress(),
          amountToStake * 4n,
          await time.latest() + 10000,
        );

        await this.permit2
        .connect(this.users[3])
        .approve(
          await tea_token.getAddress(),
          await staking.getAddress(),
          vipStake,
          await time.latest() + 10000,
        );

        await staking.connect(this.users[1]).stake([presale_token_1], [amountToStake], [param]);
        await staking.connect(this.users[2]).stake([tea_token], [amountToStake], [param2]);
        await staking.connect(this.users[3]).stake([tea_token], [vipStake], [param2]);
      });

      context('should allow users unstake many different stakes successfully', function () {
        it('#1', async function () {
          const staking = this.contract;
          const { tea_token, presale_token_1 } = this.testContracts;
          const amountToStake = ethers.parseEther('5000');
          const rewards = [
            20000n * 10n ** 18n,
            8000n * 10n ** 18n,
            30000n * 10n ** 18n,
            4000n * 10n ** 18n,
          ];
          const param: OffChainStruct = {
            token: tea_token,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };
          const param2: OffChainStruct = {
            token: presale_token_1,
            from: this.users[2].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };

          // User1 and User2 decided to stake more tokens

          await tea_token.connect(this.users[1]).approve(permit2Addr, ethers.MaxInt256);

          await this.permit2
          .connect(this.users[1])
          .approve(
            await tea_token.getAddress(),
            await staking.getAddress(),
            amountToStake * 4n,
            await time.latest() + 10000,
          );

          await staking.connect(this.users[1]).stake([tea_token], [amountToStake * 4n], [param]);
          await staking
            .connect(this.users[2])
            .stake([presale_token_1], [amountToStake * 2n], [param2]);

          // 15 days passed
          await time.increase(86400 * 15);

          // User1 decided to unstake two of his stakes
          await makeUnstakeCall(
            staking,
            this.users[1],
            this.operator,
            [1n, 4n],
            [rewards[0], rewards[1]],
          );

          // Check User1 changesаппру
          expect(await staking.getTotalUserStakedTokens(this.users[1])).to.be.equal(0);
          expect(await staking.totalStakedTokens()).to.equal(ethers.parseEther('1060001'));
          expect(await staking.getUserIds(this.users[1].address)).to.deep.equal([1n, 4n]);

          // 14 days passed for cooldown time
          await time.increase(86400 * 14);

          // User1 can withdraw now
          const withdrawTx2 = staking.connect(this.users[1]).withdraw([4n]);

          // Check User1 changes after withdraw
          await expect(withdrawTx2).to.changeTokenBalances(
            tea_token,
            [this.users[1], staking],
            [amountToStake * 4n, -amountToStake * 4n],
          );
          expect(await staking.getUserIds(this.users[1].address)).to.deep.equal([1n]);

          // 47 days passed
          await time.increase(86400 * 47);

          // User2 decided to unstake two of his stakes
          await makeUnstakeCall(
            staking,
            this.users[2],
            this.operator,
            [2n, 5n],
            [rewards[2], rewards[3]],
          );

          // Check User2 changes
          expect(await staking.getTotalUserStakedTokens(this.users[2])).to.be.equal(0);
          expect(await staking.totalStakedTokens()).to.equal(ethers.parseEther('1000001'));
          expect(await staking.getUserIds(this.users[2])).to.deep.equal([2n, 5n]);

          // 14 days passed for cooldown time
          await time.increase(86400 * 14);

          // User2 can withdraw now
          const user2_withdrawTx2 = staking.connect(this.users[2]).withdraw([2n]);

          // Check User2 changes after withdraw
          await expect(user2_withdrawTx2).to.changeTokenBalances(
            tea_token,
            [this.users[2], staking],
            [amountToStake * 10n , -amountToStake * 10n],
          );
          expect(await staking.getUserIds(this.users[1])).to.deep.equal([1n]);
        });

        it('#2', async function () {
          const staking = this.contract;
          const { tea_token, presale_token_1, tea_vesting } = this.testContracts;
          const amountToStake = ethers.parseEther('5000');
          const rewards = 8000n * 10n ** 18n;
          const param: OffChainStruct = {
            token: tea_token,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };
          const param2: OffChainStruct = {
            token: presale_token_1,
            from: this.users[4].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };

          // User1 and User4 decided to stake more tokens

          await tea_token.connect(this.users[1]).approve(permit2Addr, ethers.MaxInt256);

          await this.permit2
          .connect(this.users[1])
          .approve(
            await tea_token.getAddress(),
            await staking.getAddress(),
            amountToStake * 2n,
            await time.latest() + 10000,
          );

          await staking.connect(this.users[1]).stake([tea_token], [amountToStake * 2n], [param]);
          await staking
            .connect(this.users[4])
            .stake([presale_token_1], [amountToStake * 3n], [param2]);

          // 36 days passed
          await time.increase(86400 * 36);

          // User2 decided to unstake his stakes
          await makeUnstakeCall(staking, this.users[2], this.operator, [2n], [rewards]);

          // Check User2 changes
          expect(await staking.getTotalUserStakedTokens(this.users[2])).to.be.equal(0);
          expect(await staking.totalStakedTokens()).to.equal(ethers.parseEther('1075001'));
          expect(await staking.getUserIds(this.users[2])).to.deep.equal([2n]);

          // 172 days passed
          await time.increase(86400 * 172);

          // User2 can withdraw now
          const user2_withdrawTx = staking.connect(this.users[2]).withdraw([2n]);

          // Check User2 changes after withdraw
          await expect(user2_withdrawTx).to.changeTokenBalances(
            tea_token,
            [this.users[2], staking],
            [amountToStake * 10n, -amountToStake * 10n],
          );
          expect(await staking.getUserIds(this.users[2])).to.deep.equal([]);

          // 47 days passed
          await time.increase(86400 * 47);

          const timePassed = calculateDaysInSeconds(36n + 172n + 47n);
          const user1_cal_presale = calculateUserRewards(
            await staking.totalStakedTokens(),
            await staking.getTotalUserStakedTokens(this.users[1]),
            ethers.parseEther('50000'),
            timePassed,
          );
          const user1_cal_tea = calculateUserRewards(
            await staking.totalStakedTokens(),
            await staking.getTotalUserStakedTokens(this.users[1]),
            amountToStake * 2n,
            timePassed,
          );

          // User1 decided to unstake two of his stakes
          await makeUnstakeCall(
            staking,
            this.users[1],
            this.operator,
            [1n, 4n],
            [user1_cal_presale, user1_cal_tea],
          );

          // Check User1 changes
          expect(await staking.getTotalUserStakedTokens(this.users[1])).to.be.equal(0);
          expect(await staking.totalStakedTokens()).to.equal(ethers.parseEther('1015001'));
          expect(await staking.getUserIds(this.users[1])).to.deep.equal([1n, 4n]);

          // User4 decided to unstake & withdraw his stake
          const unlockedTokens = await tea_vesting.getUserUnlockReward(
            presale_token_1,
            this.users[4],
          );
          const user4_cal_presale = calculateUserRewards(
            await staking.totalStakedTokens(),
            await staking.getTotalUserStakedTokens(this.users[4]),
            ethers.parseEther('15000'),
            timePassed,
          );
          await makeUnstakeCall(staking, this.users[4], this.operator, [5n], [user4_cal_presale]);

          const balanceAfter = await tea_token.balanceOf(this.users[4]);
          expect(balanceAfter).to.be.gt(user4_cal_presale + unlockedTokens);
          expect(await staking.getUserIds(this.users[4])).to.deep.equal([5n]);
        });

        it('should emit Unstaked event', async function () {
          const staking = this.contract;
          const amountToUnstake = ethers.parseEther('50000');
          const proofs = 5436543654n;

          const unstakeTx = makeUnstakeCall(staking, this.users[1], this.operator, [1n], [proofs]);

          await expect(unstakeTx)
            .to.be.emit(staking, 'Unstaked')
            .withArgs(this.users[1], 1n, amountToUnstake);
        });
      });

      context('when user puts incorrect values', function () {
        it('should revert custom error InvalidArrayLengths', async function () {
          const staking = this.contract;
          const amountToUnstake = ethers.parseEther('5000');

          const unstakeTx = makeUnstakeCall(
            staking,
            this.users[1],
            this.operator,
            [1n, 2n],
            [amountToUnstake],
          );

          await expect(unstakeTx).to.be.revertedWithCustomError(staking, 'InvalidArrayLengths');
        });

        it('should revert custom error InvalidId', async function () {
          const staking = this.contract;
          const amountToUnstake = ethers.parseEther('5000');

          const unstakeTx = makeUnstakeCall(
            staking,
            this.users[1],
            this.operator,
            [3n],
            [amountToUnstake],
          );

          await expect(unstakeTx).to.be.revertedWithCustomError(staking, 'InvalidId');
        });

        it('should revert error INVALID_OPERATOR', async function () {
          const staking = this.contract;
          const proofs = 300n * 10n ** 15n;
          const sig = await getUnstakeSignature(
            staking,
            this.users[1],
            this.operator,
            [1n],
            [proofs],
          );
          const param: UnstakeParam = {
            user: this.users[1],
            operator: this.users[7],
            ids: [1n],
            rewardsWithLoyalty: [proofs],
            ...sig,
          };

          const unstakeTx = staking.connect(this.users[1]).unstake(param);

          await expect(unstakeTx).to.be.revertedWith('INVALID_OPERATOR');
        });

        it('should revert error SIGNATURE_EXPIRED', async function () {
          const staking = this.contract;
          const amountToUnstake = ethers.parseEther('5000');

          const sig = await getUnstakeSignature(
            staking,
            this.users[1],
            this.operator,
            [1n],
            [amountToUnstake],
          );
          const param: UnstakeParam = {
            user: this.users[1],
            operator: this.operator,
            ids: [1n],
            rewardsWithLoyalty: [amountToUnstake],
            ...sig,
          };

          await time.increase(86400 * 5678);

          const unstakeTx = staking.connect(this.users[1]).unstake(param);

          await expect(unstakeTx).to.be.revertedWith('SIGNATURE_EXPIRED');
        });

        it('should revert error MISMATCHING_NONCES', async function () {
          const staking = this.contract;
          const amountToUnstake = ethers.parseEther('5000');

          const sig = await getUnstakeSignature(
            staking,
            this.users[1],
            this.operator,
            [1n],
            [amountToUnstake],
          );
          const param: UnstakeParam = {
            user: this.users[1],
            operator: this.operator,
            ids: [1n],
            rewardsWithLoyalty: [amountToUnstake],
            nonce: sig.nonce + 1n,
            deadline: sig.deadline,
            v: sig.v,
            r: sig.r,
            s: sig.s,
          };

          const unstakeTx = staking.connect(this.users[1]).unstake(param);

          await expect(unstakeTx).to.be.revertedWith('MISMATCHING_NONCES');
        });

        it('should revert error INVALID_SIGNATURE', async function () {
          const staking = this.contract;
          const proofs = 300n * 10n ** 15n;
          const sig = await getUnstakeSignature(
            staking,
            this.users[1],
            this.operator,
            [1n],
            [proofs],
          );
          const param: UnstakeParam = {
            user: this.users[2],
            operator: this.operator,
            ids: [1n],
            rewardsWithLoyalty: [proofs],
            ...sig,
          };

          const unstakeTx = staking.connect(this.users[1]).unstake(param);

          await expect(unstakeTx).to.be.revertedWith('INVALID_SIGNATURE');
        });
      });

      context("when user's locked time is not passed", function () {
        it('should revert custom error LockedPeriodNotPassed', async function () {
          const staking = this.contract;
          const vipStake = ethers.parseEther('1000001');

          const unstakeTx = makeUnstakeCall(
            staking,
            this.users[3],
            this.operator,
            [3n],
            [vipStake],
          );

          await expect(unstakeTx).to.be.revertedWithCustomError(staking, 'LockedPeriodNotPassed');
        });
      });

      context(
        "when user's locked time is passed but 30 days protect time is not passed",
        function () {
          it('should revert custom error LockedPeriodNotPassed', async function () {
            const staking = this.contract;
            const { tea_token } = this.testContracts;
            const vipAmount = ethers.parseEther('1000000');
            const param: OffChainStruct = {
              token: tea_token,
              from: this.users[4].address,
              to: staking,
              deadline: 0n,
              v: 0n,
              r: zeroPadBytes('0x', 32),
              s: zeroPadBytes('0x', 32),
            };

            await time.increase(86400 * 300);

            await tea_token.connect(this.users[4]).approve(permit2Addr, ethers.MaxInt256);

            await this.permit2
            .connect(this.users[4])
            .approve(
              await tea_token.getAddress(),
              await staking.getAddress(),
              vipAmount,
              await time.latest() + 10000,
            );
            await staking.connect(this.users[4]).stake([tea_token], [vipAmount], [param]);

            await time.increase(86400 * 75);

            const unstakeTx = makeUnstakeCall(
              staking,
              this.users[4],
              this.operator,
              [4n],
              [vipAmount],
            );

            await expect(unstakeTx).to.be.revertedWithCustomError(staking, 'LockedPeriodNotPassed');
          });
        },
      );

      context('when proof from BE is not valid', function () {
        it('should revert custom error InvalidCalculationReward', async function () {
          const staking = this.contract;
          const proofs = 100000n * 10n ** 18n;

          const unstakeTx = makeUnstakeCall(staking, this.users[2], this.operator, [2n], [proofs]);

          await expect(unstakeTx).to.be.revertedWithCustomError(
            staking,
            'InvalidCalculationReward',
          );
        });
      });

      context('when user has already unstaked', function () {
        it('should revert custom error NothingToUnstake', async function () {
          const staking = this.contract;
          const proof = 17n * 10n ** 16n;

          await makeUnstakeCall(staking, this.users[2], this.operator, [2n], [proof]);
          const unstakeTx = makeUnstakeCall(staking, this.users[2], this.operator, [2n], [proof]);

          await expect(unstakeTx).to.be.revertedWithCustomError(staking, 'NothingToUnstake');
        });
      });
    });

    context('withdraw()', function () {
      context('when user withdraw tokens correctly', function () {
        beforeEach(async function () {
          const staking = this.contract;
          const { tea_token, presale_token_1 } = this.testContracts;
          const amountToStake = ethers.parseEther('5000');
          const vipAmount = ethers.parseEther('1000000');
          const param: OffChainStruct = {
            token: presale_token_1,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };
          const param2: OffChainStruct = {
            token: tea_token,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };

          await tea_token.connect(this.users[1]).approve(permit2Addr, ethers.MaxInt256);

          await this.permit2
          .connect(this.users[1])
          .approve(
            await tea_token.getAddress(),
            await staking.getAddress(),
            amountToStake,
            await time.latest() + 10000,
          );
          await staking.connect(this.users[1]).stake([tea_token], [amountToStake], [param2]);
          await staking.connect(this.users[2]).stake([presale_token_1], [vipAmount], [param]);
        });

        it('should allow user withdraws successfully as not vip', async function () {
          const staking = this.contract;
          const { tea_token } = this.testContracts;
          const user1_proof = 20n * 10n ** 15n;

          await makeUnstakeCall(staking, this.users[1], this.operator, [1n], [user1_proof]);

          await time.increase(86400 * 15);

          const withdrawTx = await staking.connect(this.users[1]).withdraw([1n]);

          expect(withdrawTx).to.changeTokenBalances(
            tea_token,
            [this.users[1], staking],
            [-ethers.parseEther('5000'), ethers.parseEther('5000')],
          );
          expect(await staking.getTotalUserStakedTokens(this.users[1])).to.be.equal(0);
          expect(await staking.totalStakedTokens()).to.equal(ethers.parseEther('1000000'));
        });

        it('should allow user withdraws successfully as vip', async function () {
          const staking = this.contract;
          const { presale_token_1 } = this.testContracts;
          const user2_proof = 26n * 10n ** 22n;

          await time.increase(86400 * 365);

          const withdrawTx = makeUnstakeCall(
            staking,
            this.users[2],
            this.operator,
            [2n],
            [user2_proof],
          );

          expect(withdrawTx).to.changeTokenBalances(
            presale_token_1,
            [this.users[1], staking],
            [-ethers.parseEther('5000'), ethers.parseEther('5000')],
          );
          expect(await staking.getTotalUserStakedTokens(this.users[3])).to.be.equal(0);
          expect(await staking.totalStakedTokens()).to.equal(ethers.parseEther('1005000'));
        });

        it('should emit Withdrawal event', async function () {
          const staking = this.contract;
          const { presale_token_1, tea_vesting } = this.testContracts;
          const vipAmount = ethers.parseEther('1000000');

          await time.increase(86400 * 365);

          const user2_cal = calculateUserRewards(
            await staking.totalStakedTokens(),
            await staking.getTotalUserStakedTokens(this.users[2]),
            vipAmount,
            86400n * 365n,
          );

          await makeUnstakeCall(staking, this.users[2], this.operator, [2n], [user2_cal]);

          await time.increase(86400 * 15);

          const stake = await staking.stakes(2n);
          const rewardDebt = stake[4];
          const reward = await tea_vesting.getUserUnlockReward(presale_token_1, this.users[2]);

          const withdrawTx = await staking.connect(this.users[2]).withdraw([2n]);
          const res = await withdrawTx.wait();
        });
      });

      context("when user doesn't unstake first", function () {
        it('should revert custom error NeedToUnstakeFirst', async function () {
          const staking = this.contract;
          const { tea_token, presale_token_1 } = this.testContracts;
          const amountToStake = ethers.parseEther('5000');
          const param: OffChainStruct = {
            token: presale_token_1,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };
          const param2: OffChainStruct = {
            token: tea_token,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };

          await tea_token.connect(this.users[2]).approve(permit2Addr, ethers.MaxInt256);

          await this.permit2
          .connect(this.users[2])
          .approve(
            await tea_token.getAddress(),
            await staking.getAddress(),
            amountToStake,
            await time.latest() + 10000,
          );
          await staking.connect(this.users[2]).stake([tea_token], [amountToStake], [param2]);
          await staking.connect(this.users[2]).stake([presale_token_1], [amountToStake], [param]);

          const withdrawTx = staking.connect(this.users[2]).withdraw([1n]);

          await expect(withdrawTx).to.be.revertedWithCustomError(staking, 'NeedToUnstakeFirst');

          const withdrawTx2 = staking.connect(this.users[2]).withdraw([2n]);

          await expect(withdrawTx2).to.be.revertedWithCustomError(staking, 'NeedToUnstakeFirst');
        });
      });

      context("when user's claim cooldown is not passed", function () {
        it('should revert custom error ClaimCooldownNotPassed', async function () {
          const staking = this.contract;
          const { tea_token } = this.testContracts;
          const amountToStake = ethers.parseEther('5000');
          const user1_proof_presale = 20n * 10n ** 15n;
          const param: OffChainStruct = {
            token: tea_token,
            from: this.users[1].address,
            to: staking,
            deadline: 0n,
            v: 0n,
            r: zeroPadBytes('0x', 32),
            s: zeroPadBytes('0x', 32),
          };

          await tea_token.connect(this.users[2]).approve(permit2Addr, ethers.MaxInt256);

          await this.permit2
          .connect(this.users[2])
          .approve(
            await tea_token.getAddress(),
            await staking.getAddress(),
            amountToStake,
            await time.latest() + 10000,
          );
          await staking.connect(this.users[2]).stake([tea_token], [amountToStake], [param]);
          await makeUnstakeCall(staking, this.users[2], this.operator, [1n], [user1_proof_presale]);



          await tea_token.connect(this.users[3]).approve(permit2Addr, ethers.MaxInt256);

          await this.permit2
          .connect(this.users[3])
          .approve(
            await tea_token.getAddress(),
            await staking.getAddress(),
            amountToStake,
            await time.latest() + 10000,
          );
          await staking.connect(this.users[3]).stake([tea_token], [amountToStake], [param]);
          await makeUnstakeCall(staking, this.users[3], this.operator, [2n], [user1_proof_presale]);

          const withdrawTx = staking.connect(this.users[2]).withdraw([1n]);
          await expect(withdrawTx).to.be.revertedWithCustomError(staking, 'ClaimCooldownNotPassed');
          const withdrawTx2 = staking.connect(this.users[3]).withdraw([2n]);
          await expect(withdrawTx2).to.be.revertedWithCustomError(
            staking,
            'ClaimCooldownNotPassed',
          );
        });
      });
    });

    context('getTotalUserStakedTokens()', function () {
      it('should return correct user total staked tokens', async function () {
        const staking = this.contract;
        const { tea_token, presale_token_1 } = this.testContracts;
        const amountToStake = ethers.parseEther('5000');
        const param: OffChainStruct = {
          token: tea_token,
          from: this.users[2].address,
          to: staking,
          deadline: 0n,
          v: 0n,
          r: zeroPadBytes('0x', 32),
          s: zeroPadBytes('0x', 32),
        };
        const param2: OffChainStruct = {
          token: presale_token_1,
          from: this.users[2].address,
          to: staking,
          deadline: 0n,
          v: 0n,
          r: zeroPadBytes('0x', 32),
          s: zeroPadBytes('0x', 32),
        };


        await tea_token.connect(this.users[2]).approve(permit2Addr, ethers.MaxInt256);

        await this.permit2
        .connect(this.users[2])
        .approve(
          await tea_token.getAddress(),
          await staking.getAddress(),
          amountToStake,
          await time.latest() + 10000,
        );

        await staking.connect(this.users[2]).stake([tea_token], [amountToStake], [param]);

        const totalStaked = await staking.getTotalUserStakedTokens(this.users[2]);

        expect(totalStaked).to.equal(amountToStake);

        await staking
          .connect(this.users[2])
          .stake([presale_token_1], [amountToStake * 2n], [param2]);

        const getUserIdsTx2 = await staking.getTotalUserStakedTokens(this.users[2]);

        expect(getUserIdsTx2).to.equal(amountToStake * 3n);
      });
    });
  });
});
