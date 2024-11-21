import { UserAccount } from './user-account.entity';
import { Token } from './token.entity';
import { IndexerState } from './indexer.state.entity';
import { Trade } from './trade.entity';
import { Comment } from './comment.entity';
import { TokenBalance } from './token.balances.entity';
import { TokenWinner } from './token.winner.entity';
import { SignInRequestEntity } from './signin.entity';
import { TokenBurn } from './token.burn.entity';

const entities = [
  UserAccount,
  Token,
  IndexerState,
  Trade,
  Comment,
  TokenBalance,
  TokenWinner,
  SignInRequestEntity,
  TokenBurn
];

export { UserAccount, Token, IndexerState, Trade, Comment, TokenBalance, TokenWinner, SignInRequestEntity, TokenBurn };
export default entities;
