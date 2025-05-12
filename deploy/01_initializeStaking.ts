import { ethers } from "hardhat";
import type { DeployFunction, Deployment } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

import { DEPLOY_CONSTANTS } from "../constants/deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre;
  const { deployer } = await getNamedAccounts();

  const { totalAllocation, rewardDistributionStartTime } = DEPLOY_CONSTANTS.teaStaking;
  if (!totalAllocation || !rewardDistributionStartTime) {
    throw new Error("Missing deploy constants");
  }

  const teaStakingDeployment = await deployments.get("TeaStaking");
  const teaStaking = await ethers.getContractAt("TeaStaking", teaStakingDeployment.address);

  await teaStaking.initializeStaking(totalAllocation, rewardDistributionStartTime, {
    from: deployer,
    gasLimit: 1_000_000,
  });
};

export default func;
func.id = "";
func.tags = ["initializeStaking"];
