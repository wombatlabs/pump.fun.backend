import { UserAccount } from './user-account.entity';
import { Token } from './token.entity';
import { IndexerState } from './indexer.state.entity';
import { Trade } from './trade.entity';
import { Comment } from './comment.entity';
import { TokenBalance } from './token.balances.entity';

const entities = [
  UserAccount,
  Token,
  IndexerState,
  Trade,
  Comment,
  TokenBalance
];

export { UserAccount, Token, IndexerState, Trade, Comment, TokenBalance };
export default entities;
