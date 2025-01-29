import { UserAccount } from './user-account.entity';
import { Token } from './token.entity';
import { IndexerState } from './indexer.state.entity';
import { Trade } from './trade.entity';
import { Comment } from './comment.entity';
import { TokenBalance } from './token.balances.entity';
import { SignInRequestEntity } from './signin.entity';
import { TokenBurn } from './token.burn.entity';
import { LiquidityProvision } from './liquidity.provision.entity';
import { CompetitionEntity } from './competition.entity';
import { ReportEntity } from './report.entity';

const entities = [
  UserAccount,
  Token,
  IndexerState,
  Trade,
  Comment,
  TokenBalance,
  SignInRequestEntity,
  TokenBurn,
  LiquidityProvision,
  CompetitionEntity,
  ReportEntity
];

export {
  UserAccount,
  Token,
  IndexerState,
  Trade,
  Comment,
  TokenBalance,
  SignInRequestEntity,
  TokenBurn,
  LiquidityProvision,
  CompetitionEntity,
  ReportEntity
};
export default entities;
