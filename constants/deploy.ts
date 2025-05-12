import { ethers } from "hardhat";

export const DEPLOY_CONSTANTS = {
  teaStaking: {
    admin: "0xdcd85DED75e992164C8fF0666c5a46a0944A6b2F",
    treasury: "0xD9dA072FC2441985e3D19A5A1628E121505833D9",
    operation: ["0xd1AeBb1b04C242e3A5404A1Bc5F8854B711D54a7"],
    trustedForwarder: "0x9ae49dD651e2ae88B8d4bD06cf3861dD39ee67C5",
    teaVesting: "0x9ae49dD651e2ae88B8d4bD06cf3861dD39ee67C5", // no vesting
    teaToken: "0x880F5e24C66BefbD8b038Fc4A66bAf35f30f0ABE",
    presaleTokens: [
      "0xc2ab1d5240f49DB75B2ce6C1205B567791416cA1",
      "0x244bfbe555E6e415451005901dB7cAB90A71B359",
      "0x42B0C6f18BFa65b0d47cf1D9a2b65538b6417b14",
    ],
    totalAllocation: ethers.parseEther("7500000"),
    rewardDistributionStartTime: 1727857290n,
  },
} as Record<string, any>;
