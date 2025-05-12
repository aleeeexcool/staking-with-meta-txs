import type { AddressLike } from "ethers";
import type { DeployFunction } from "hardhat-deploy/types";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

import { DEPLOY_CONSTANTS } from "../constants/deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { admin, treasury, operation, trustedForwarder, teaVesting, teaToken, presaleTokens } =
    DEPLOY_CONSTANTS.teaStaking;

  type ConstructorParams = [
    AddressLike,
    AddressLike,
    AddressLike[],
    AddressLike,
    AddressLike,
    AddressLike,
    AddressLike[],
  ];
  const args: ConstructorParams = [
    admin,
    treasury,
    operation,
    trustedForwarder,
    teaVesting,
    teaToken,
    presaleTokens,
  ];

  await deploy("TeaStaking", {
    from: deployer,
    args: args,
    log: true,
  });
};

export default func;
func.id = "deploy_TeaStaking";
func.tags = ["TeaStaking"];
