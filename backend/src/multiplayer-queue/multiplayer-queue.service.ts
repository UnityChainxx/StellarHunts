import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { type Repository, LessThan, MoreThan, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { type Queue, QueueStatus, SkillLevel } from './entities/queue.entity';
import type { Match } from './entities/match.entity';
import { Match as MatchEntity } from './entities/match.entity';
import type { JoinQueueDto } from './dto/join-queue.dto';
import type { QueueStatusDto } from './dto/queue-status.dto';
import type { MatchResultDto } from './dto/match-result.dto';
import type { QueueStatsDto } from './dto/queue-stats.dto';
import { MultiplayerQueueGateway } from './multiplayer-queue.gateway';

@Injectable()
export class MultiplayerQueueService {
  private readonly logger = new Logger(MultiplayerQueueService.name);

  constructor(
    private readonly queueRepository: Repository<Queue>,
    private readonly matchRepository: Repository<Match>,
    private readonly dataSource: DataSource,
    private readonly gateway: MultiplayerQueueGateway,
  ) {}

  /**
   * Join the multiplayer queue
   */
  async joinQueue(joinQueueDto: JoinQueueDto): Promise<QueueStatusDto> {
    // Check if user is already in queue
    const existingEntry = await this.queueRepository.findOne({
      where: {
        userId: joinQueueDto.userId,
        status: QueueStatus.WAITING,
      },
    });

    if (existingEntry) {
      throw new BadRequestException('User is already in queue');
    }

    // Create queue entry
    const queueEntry = this.queueRepository.create({
      userId: joinQueueDto.userId,
      username: joinQueueDto.username,
      skillLevel: joinQueueDto.skillLevel,
      gameMode: joinQueueDto.gameMode || 'classic',
      preferences: {
        maxWaitTime: joinQueueDto.maxWaitTime,
        preferredOpponents: joinQueueDto.preferredOpponents,
        avoidOpponents: joinQueueDto.avoidOpponents,
      },
    });

    const savedEntry = await this.queueRepository.save(queueEntry);
    this.logger.log(`User ${joinQueueDto.username} joined queue`);

    // Try immediate matchmaking
    await this.processMatchmaking();

    return this.mapToQueueStatusDto(savedEntry);
  }

  /**
   * Leave the queue
   */
  async leaveQueue(userId: string): Promise<void> {
    const queueEntry = await this.queueRepository.findOne({
      where: {
        userId,
        status: QueueStatus.WAITING,
      },
    });

    if (!queueEntry) {
      throw new NotFoundException('User not found in queue');
    }

    queueEntry.status = QueueStatus.LEFT;
    queueEntry.leftAt = new Date();
    await this.queueRepository.save(queueEntry);

    this.logger.log(`User ${queueEntry.username} left queue`);
  }

  /**
   * Get queue status for a user
   */
  async getQueueStatus(userId: string): Promise<QueueStatusDto | null> {
    const queueEntry = await this.queueRepository.findOne({
      where: {
        userId,
        status: QueueStatus.WAITING,
      },
    });

    if (!queueEntry) {
      return null;
    }

    // Update wait time
    const waitTime = Math.floor(
      (Date.now() - queueEntry.createdAt.getTime()) / 1000,
    );
    queueEntry.waitTime = waitTime;
    await this.queueRepository.save(queueEntry);

    return this.mapToQueueStatusDto(queueEntry);
  }

  /**
   * Get all users currently in queue
   */
  async getQueueList(): Promise<QueueStatusDto[]> {
    const queueEntries = await this.queueRepository.find({
      where: { status: QueueStatus.WAITING },
      order: { createdAt: 'ASC' },
    });

    // Update wait times
    const now = Date.now();
    for (const entry of queueEntries) {
      entry.waitTime = Math.floor((now - entry.createdAt.getTime()) / 1000);
    }

    await this.queueRepository.save(queueEntries);

    return queueEntries.map((entry) => this.mapToQueueStatusDto(entry));
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<QueueStatsDto> {
    const waitingEntries = await this.queueRepository.find({
      where: { status: QueueStatus.WAITING },
    });

    const now = Date.now();
    const waitTimes = waitingEntries.map((entry) =>
      Math.floor((now - entry.createdAt.getTime()) / 1000),
    );

    // Group by skill level
    const bySkillLevel: Record<string, number> = {};
    Object.values(SkillLevel).forEach((level) => {
      bySkillLevel[level] = 0;
    });

    // Group by game mode
    const byGameMode: Record<string, number> = {};

    waitingEntries.forEach((entry) => {
      bySkillLevel[entry.skillLevel]++;
      byGameMode[entry.gameMode] = (byGameMode[entry.gameMode] || 0) + 1;
    });

    // Get matches created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const matchesToday = await this.matchRepository.count({
      where: {
        createdAt: MoreThan(today),
      },
    });

    return {
      totalInQueue: waitingEntries.length,
      bySkillLevel,
      byGameMode,
      averageWaitTime:
        waitTimes.length > 0
          ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
          : 0,
      longestWaitTime: waitTimes.length > 0 ? Math.max(...waitTimes) : 0,
      matchesToday,
    };
  }

  /**
   * Get match details
   */
  async getMatch(matchId: string): Promise<MatchResultDto> {
    const match = await this.matchRepository.findOne({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException('Match not found');
    }

    return this.mapToMatchResultDto(match);
  }

  /**
   * Process matchmaking logic (runs periodically via cron).
   *
   * **Matching algorithm (graph-based stable pairing):**
   *
   * 1. **Grouping phase** — `groupPlayersForMatching` partitions waiting players
   *    into buckets by `(gameMode, skillLevel)`. Long-waiting players (waitTime > 2 min)
   *    are also collected into cross-skill buckets so they don't starve.
   *
   * 2. **Pairing phase** — For every group with ≥ 2 players, `pairPlayersInGroup`
   *    builds a **weighted compatibility graph**:
   *
   *    - Vertices are the players in the group.
   *    - An edge `(A, B)` exists **only** if neither party has the other in their
   *      `avoidOpponents` list (mutual incompatibility removes the edge entirely).
   *    - Each surviving edge is assigned a **compatibility score** that encodes
   *      both directional preferences (`preferredOpponents`) and parity:
   *
   *        | Condition                                   | Score  |
   *        |---------------------------------------------|--------|
   *        | Both list each other as `preferredOpponents` | 100    |
   *        | One lists the other as `preferredOpponents`  | 50     |
   *        | Neither has a stated preference              | 10 + ε |
   *        | Either has the other in `avoidOpponents`     | — edge removed |
   *
   *    - Edges are sorted by score descending and **greedily consumed**: the
   *      highest-scoring pair is matched first, then both vertices are removed
   *      from further consideration. This yields a deterministic, O(n² log n)
   *      result that is **stable** in the sense that no two unmatched players
   *      would prefer each other over their current matches (because any such
   *      pair would have been considered earlier when their edge was processed).
   *
   * 3. **Match creation** — For every pair produced by the algorithm,
   *    `createMatch` persists the match and updates queue-entry status within a
   *    single database transaction.
   *
   * Players who remain unmatched (odd counts) keep their `WAITING` status and
   * are picked up by the next cron cycle.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processMatchmaking(): Promise<void> {
    const waitingPlayers = await this.queueRepository.find({
      where: { status: QueueStatus.WAITING },
      order: { createdAt: 'ASC' },
      take: 200,
    });

    if (waitingPlayers.length < 2) {
      return;
    }

    this.logger.log(
      `Processing matchmaking for ${waitingPlayers.length} players`,
    );

    // Group players by game mode and skill level
    const playerGroups = this.groupPlayersForMatching(waitingPlayers);

    for (const group of playerGroups) {
      if (group.length >= 2) {
        // Use graph-based stable pairing instead of naive slice(0,2)
        const pairs = this.pairPlayersInGroup(group);
        for (const pair of pairs) {
          const match = await this.createMatch(pair);
          if (match) {
            // Real-time notification so clients leave the queue immediately.
            this.gateway.notifyMatchCreated(this.mapToMatchResultDto(match));
          }
        }
      }
    }
  }

  /**
   * Pair players within a group using a greedy maximum-weight matching
   * algorithm on a compatibility graph.
   *
   * **Scope:** This method operates on a single homogeneous group (same
   * `gameMode` and `skillLevel`). It returns an array of 2-element arrays
   * where each sub-array is a compatible pair ready for match creation.
   *
   * **Algorithm (greedy weighted matching):**
   *
   * 1. Build a complete graph where vertices are the input players.
   * 2. Remove any edge `(i, j)` where `i` has `j` in `avoidOpponents` **or**
   *    `j` has `i` in `avoidOpponents` (incompatible).
   * 3. Score every surviving edge with `computeCompatibilityScore`.
   * 4. Sort edges by score descending, tie-breaking by player index for
   *    determinism.
   * 5. Iterate edges greedily: if neither endpoint is already matched, pair
   *    them and mark both as matched.
   *
   * **Why greedy?** The problem of finding a maximum-weight matching in a
   * general graph (Blossom algorithm) is O(n³) and adds significant complexity
   * for little gain given our small group sizes (typically 2 – 20). The greedy
   * approach is O(n² log n), deterministic, and produces optimal or near-optimal
   * results because our edge weights are so coarse (only 3 tiers).
   *
   * @param group - Players in the same game-mode / skill-level bucket.
   * @returns An array of 2-player pairs to match.
   */
  private pairPlayersInGroup(group: Queue[]): [Queue, Queue][] {
    if (group.length < 2) return [];

    const n = group.length;
    const matched = new Array<boolean>(n).fill(false);
    const pairs: [Queue, Queue][] = [];

    // Build sorted list of all compatible edges
    interface Edge {
      i: number;
      j: number;
      score: number;
    }

    const edges: Edge[] = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const score = this.computeCompatibilityScore(group[i], group[j]);
        // -1 signals incompatibility (avoidOpponents conflict)
        if (score >= 0) {
          edges.push({ i, j, score });
        }
      }
    }

    // Sort by score descending; tie-break by (i, j) for determinism
    edges.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.i !== b.i) return a.i - b.i;
      return a.j - b.j;
    });

    // Greedy matching
    for (const edge of edges) {
      if (matched[edge.i] || matched[edge.j]) continue;
      matched[edge.i] = true;
      matched[edge.j] = true;
      pairs.push([group[edge.i], group[edge.j]]);
    }

    return pairs;
  }

  /**
   * Group players for optimal matching.
   *
   * Partitions waiting players into buckets by `(gameMode, skillLevel)`.
   * Long-waiting players (waitTime > 120 s) are also collected into
   * cross-skill buckets so they don't starve in the queue.
   */
  private groupPlayersForMatching(players: Queue[]): Queue[][] {
    const groups: Record<string, Queue[]> = {};

    players.forEach((player) => {
      const key = `${player.gameMode}-${player.skillLevel}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(player);
    });

    // Also try cross-skill matching for players waiting too long
    const longWaitingPlayers = players.filter((p) => p.waitTime > 120); // 2 minutes
    if (longWaitingPlayers.length >= 2) {
      const crossSkillKey = `cross-skill-${longWaitingPlayers[0].gameMode}`;
      groups[crossSkillKey] = longWaitingPlayers;
    }

    return Object.values(groups);
  }

  /**
   * Compute a numeric compatibility score between two players.
   *
   * Returns `-1` if the players are incompatible (either has the other in
   * `avoidOpponents`). Otherwise returns a score where higher values indicate
   * a stronger desired pairing.
   *
   * Scoring tiers:
   * - **100** — Mutual `preferredOpponents` (both listed each other)
   * - **50**  — One-sided `preferredOpponents`
   * - **10 + ε** — No explicit preference (ε is a small tie-breaker based on
   *                player indices to ensure determinism)
   */
  private computeCompatibilityScore(a: Queue, b: Queue): number {
    const aAvoidsB = a.preferences?.avoidOpponents?.includes(b.userId) ?? false;
    const bAvoidsA = b.preferences?.avoidOpponents?.includes(a.userId) ?? false;

    // Incompatible — remove edge entirely
    if (aAvoidsB || bAvoidsA) {
      return -1;
    }

    const aPrefersB =
      a.preferences?.preferredOpponents?.includes(b.userId) ?? false;
    const bPrefersA =
      b.preferences?.preferredOpponents?.includes(a.userId) ?? false;

    if (aPrefersB && bPrefersA) return 100; // mutual preference
    if (aPrefersB || bPrefersA) return 50; // one-sided preference
    return 10; // neutral
  }

  /**
   * Create a match between players inside a transactional boundary so that
   * an interrupt (crash / network error) after saving the match but before
   * updating queue entries does not leave partial state.
   */
  private async createMatch(players: Queue[]): Promise<Match> {
    if (players.length < 2) {
      throw new BadRequestException(
        'Need at least 2 players to create a match',
      );
    }

    // Check preferences
    if (!this.checkPlayerCompatibility(players)) {
      this.logger.log('Players not compatible based on preferences');
      return null;
    }

    return this.dataSource.transaction(async (manager) => {
      const match = manager.create(MatchEntity, {
        playerIds: players.map((p) => p.userId),
        playerUsernames: players.map((p) => p.username),
        gameMode: players[0].gameMode,
        skillLevel: players[0].skillLevel,
        averageWaitTime: Math.floor(
          players.reduce((sum, p) => sum + p.waitTime, 0) / players.length,
        ),
      });

      const savedMatch = await manager.save(match);

      // Update queue entries within the same transaction
      for (const player of players) {
        player.status = QueueStatus.MATCHED;
        player.matchId = savedMatch.id;
        player.matchedAt = new Date();
      }

      await manager.save(players);

      this.logger.log(
        `Created match ${savedMatch.id} with players: ${players.map((p) => p.username).join(', ')}`,
      );

      return savedMatch;
    });
  }

  /**
   * Check if players are compatible based on preferences
   */
  private checkPlayerCompatibility(players: Queue[]): boolean {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const player1 = players[i];
        const player2 = players[j];

        // Check if player1 wants to avoid player2
        if (player1.preferences?.avoidOpponents?.includes(player2.userId)) {
          return false;
        }

        // Check if player2 wants to avoid player1
        if (player2.preferences?.avoidOpponents?.includes(player1.userId)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Clean up old queue entries (runs daily)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldEntries(): Promise<void> {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const result = await this.queueRepository.delete({
      createdAt: LessThan(oneDayAgo),
      status: QueueStatus.LEFT,
    });

    this.logger.log(`Cleaned up ${result.affected} old queue entries`);
  }

  /**
   * Map Queue entity to DTO
   */
  private mapToQueueStatusDto(queue: Queue): QueueStatusDto {
    return {
      id: queue.id,
      userId: queue.userId,
      username: queue.username,
      status: queue.status,
      skillLevel: queue.skillLevel,
      gameMode: queue.gameMode,
      waitTime: queue.waitTime,
      matchId: queue.matchId,
      createdAt: queue.createdAt,
      matchedAt: queue.matchedAt,
    };
  }

  /**
   * Map Match entity to DTO
   */
  private mapToMatchResultDto(match: Match): MatchResultDto {
    return {
      matchId: match.id,
      playerIds: match.playerIds,
      playerUsernames: match.playerUsernames,
      status: match.status,
      gameMode: match.gameMode,
      skillLevel: match.skillLevel,
      averageWaitTime: match.averageWaitTime,
      createdAt: match.createdAt,
    };
  }
}
