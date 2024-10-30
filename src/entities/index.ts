import { UserAccount } from './user-account.entity';
import { Token } from './token.entity';
import { IndexerState } from './indexer.state.entity';
import { Trade } from './trade.entity';
import { Comment } from './comment.entity';

const entities = [
  UserAccount,
  Token,
  IndexerState,
  Trade,
  Comment
];

export { UserAccount, Token, IndexerState, Trade, Comment };
export default entities;
