# Staking Contract Overview

The Staking contract allows users to stake 2 types of tokens, earn rewards, and manage their
stakes. The contract supports several staking scenarios including VIP/Standard and Presale/Native token
staking, with a loyalty program that increases rewards for long-term stakers. It integrates with the
Vesting contract and ensures secure token transfers using on-chain computations and external
off-chain systems for certain operations.

## List of Contents

- [Key Features](#key-features)
- [Staking Options](#staking-options)
- [Loyalty Program](#loyalty-program)
- [Backend Integration](#backend-integration)
- [Core Data Structures](#core-data-structures)
- [Key Functions](#key-functions)
- [Reward Functions](#reward-functions)
- [Error Handling](#error-handling)
- [Events](#events)
- [Security and Safeguards](#security-and-safeguards)

### Key Features

- Multiple Staking Cases: Supports staking for both VIP and Standard users, and distinguishes
  between Presale and Native tokens.
- Loyalty Program: Long-term stakers receive up to 50% more rewards over time.
- Off-chain Integration: Certain operations, such as reward calculations, are offloaded to a backend
  to ensure scalability and efficiency.
- Safe Token Operations: Utilizes OpenZeppelin’s SafeERC20 to ensure secure token transfers and
  prevent issues like reentrancy attacks.
- Ownership Transfers: Allows on-chain and off-chain ownership transfers using signatures, enhancing
  flexibility in managing user stakes.

### Staking Options

## VIP vs Standard Staking

- Standard Users: Any user staking below a certain threshold is considered a standard staker and
  follows the basic staking rules.
- VIP Users: Users staking above a certain token threshold are granted VIP status, allowing them to
  benefit from extended lock periods and potentially higher rewards.

### Loyalty Program

The Loyalty Program increases rewards for long-term stakers by adding a bonus of 1% to the staking
reward every week after the first two weeks of staking. This bonus accumulates weekly for up to 50
weeks, maxing out at a 50% reward boost.

- Week 1-2: Standard rewards, no loyalty bonus.
- Week 3 and onward: Each additional week adds +1% to the reward, up to 50%.

For instance:

- If a user stakes for 10 weeks, they will receive 8% more rewards (1% per week after week 2).
- If a user stakes for the full 52 weeks, their rewards will be 50% higher compared to a standard
  2-week staker. To calculate this, we use a point system, where every loyalty bonus week increases
  the user's points/weight. These points are factored into the final reward calculation, ensuring
  accuracy.

Example Calculation

A user who stakes 1,000 tokens for 5 weeks will accumulate:

- Standard rewards for the first two weeks.
- +1% for week 3, +1% for week 4, and +1% for week 5, for a total of +3% on top of the base reward.

### Backend Integration

The backend system plays a critical role in ensuring the scalability and security of the staking
process:

Why Use a Backend?

1. Cost Efficiency: Storing and updating every user's staking data and loyalty points directly
   on-chain would be prohibitively expensive.Instead, we track certain aspects off-chain and only
   update the blockchain when necessary (e.g., during reward claims or stake withdrawals).

2. Security: While most critical operations occur on-chain (e.g., token transfers, reward claims),
   the backend adds an extra layer of security by ensuring that if the backend is ever compromised,
   funds are not at risk. The backend handles calculations, but final values are verified on-chain
   before executing any token-related operations with 50% of threshold.

On-Chain vs. Off-Chain Calculations

- On-chain: Core operations like staking, unstaking, and transfers remain on-chain to ensure
  security and immutability.
- Off-chain: The backend is responsible for calculating and managing loyalty bonuses, as well as
  maintaining non-essential user data (such as points accrued through loyalty). This ensures that
  the system is scalable without incurring excessive gas fees for users.

### Core Data Structures

1. Stake: This structure tracks the user's staking details such as the staked amount, reward debt,
   and the locked period for VIPs.

```
struct Stake {
    bool vip;
    address token;
    uint256 stakedTokens;
    uint256 availableTokens;
    uint256 rewardDebt;
    uint256 claimCooldown;
    uint256 lockedPeriod;
}
```

2. UnstakeParam: This structure is used for user unstaking with batch of staking ids and rewards
   calculated with loyalty on our backend, containing the necessary signature information.

```
struct UnstakeParam {
    address user;
    address operator;
    uint256[] ids;
    uint256[] rewardsWithLoyalty;
    uint256 nonce;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
}
```

3. OffChainStruct: This is used for off-chain ownership transfers, containing the necessary
   signature information.

```
struct OffChainStruct {
    address token;
    address from;
    address to;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
}
```

### Key Functions

1. stake(): Allows users to stake their tokens. It checks the validity of the tokens and the user’s
   stake, then records the stake.

`function stake(address[] calldata _tokens, uint256[] calldata _amounts, OffChainStruct calldata _offChain) external`

2. unstake(): Enables users to unstake their tokens and claim rewards. This function verifies the
   user's unstake request and ensures their eligibility.

`function unstake(UnstakeParam calldata _params) external`

3. withdraw(): Handles the withdrawal of staked tokens after the locked period (for VIPs) or claim
   cooldown (for non-VIPs) has passed.

`function withdraw(uint256[] memory _ids) public`

### Reward Functions

1. initializeStaking(): Initializes the staking with a given total allocation and a reward
   distribution start time.

`function initializeStaking(uint256 _totalAllocation, uint256 _rewardDistributionStartTime) external`

2. updateRewardPerShare(): Updates the reward per share based on the number of tokens staked and
   time passed.

`function updateRewardPerShare() public`

### Error Handling

The contract includes custom errors for various failure cases such as:

- StakingNotStarted(): Thrown when staking is attempted before the staking period begins.
- InvalidArrayLengths(): Raised when the arrays passed to a function have mismatched lengths.
- StakingAlreadyInitialized(): Thrown if staking is re-initialized when already active.
- NeedToUnstakeFirst(): Raised when a user tries to claim tokens without unstaking.
- UserAlreadyStakedWithThisToken(): Prevents users from staking the same token multiple times.
- NoZeroAmount(): Ensures users cannot stake or unstake zero tokens.
- LockedPeriodNotPassed(): Raised when a user tries to withdraw before the VIP lock period ends.
- NothingToUnstake(): Thrown when a user tries to unstake without any staked tokens.
- ClaimCooldownNotPassed(): Prevents users from claiming rewards if the cooldown period has not
  passed.
- InvalidCalculationReward(): Thrown if the reward calculation is invalid or exceeds expected
  values.

### Events

1. Staked: Emitted when a user stakes tokens
   `event Staked(address indexed user, address indexed token, uint256 amount)`

2. Unstaked: Emitted when a user unstakes their tokens
   `event Unstaked(address indexed user, uint256 id, uint256 amount)`

3. Withdrawal: Emitted when a user withdraws their staked tokens and rewards
   `event Withdrawal(address indexed user, address indexed token, uint256 availableTokens, uint256 reward)`

4. UpdatedShareReward: Emitted when the reward per share is updated.
   `event UpdatedShareReward(uint256 timestamp, uint256 totalStakedTokens, uint256 rewardPerShare); `

### Security and Safeguards

The Staking contract incorporates various security measures to ensure safe and fair staking:

- ReentrancyGuard: Prevents reentrancy attacks.
- SafeERC20: Ensures secure token transfers.
- AccessControl: Role-based access control to restrict sensitive functions to admin or operational
  roles.
