import type { PhysicsWorld } from '../engine/PhysicsWorld';
import type { Player } from '../entities/Player';
import type { ArenaShrink } from './ArenaShrink';
import { Vector2D } from '../math/Vector2D';

export type MatchState =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'ROUND_ACTIVE'
  | 'ROUND_OVER'
  | 'INTERMISSION_DRAFT'
  | 'MATCH_OVER';

export type RoundWinner = 'player' | 'bot' | 'draw';

export interface MatchSnapshot {
  playerWins: number;
  botWins: number;
  roundNumber: number;
  targetWins: number;
  lastRoundWinner: RoundWinner | null;
}

const COUNTDOWN_DURATION = 3.0;
const ROUND_OVER_DURATION = 1.5;

export class MatchManager {
  state: MatchState = 'LOBBY';
  playerWins = 0;
  botWins = 0;
  roundNumber = 1;
  targetWins = 5;
  stateTimer = 0;
  lastRoundWinner: RoundWinner | null = null;
  onStateChange?: (state: MatchState) => void;

  getSnapshot(): MatchSnapshot {
    return {
      playerWins: this.playerWins,
      botWins: this.botWins,
      roundNumber: this.roundNumber,
      targetWins: this.targetWins,
      lastRoundWinner: this.lastRoundWinner,
    };
  }

  startMatch(): void {
    this.playerWins = 0;
    this.botWins = 0;
    this.roundNumber = 1;
    this.lastRoundWinner = null;
    this.transitionTo('COUNTDOWN', COUNTDOWN_DURATION);
  }

  update(dt: number): void {
    if (this.state === 'COUNTDOWN' || this.state === 'ROUND_OVER') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        if (this.state === 'COUNTDOWN') {
          this.transitionTo('ROUND_ACTIVE', 0);
        } else if (this.state === 'ROUND_OVER') {
          if (this.playerWins >= this.targetWins || this.botWins >= this.targetWins) {
            this.transitionTo('MATCH_OVER', 0);
          } else {
            this.transitionTo('INTERMISSION_DRAFT', 0);
          }
        }
      }
    }
  }

  checkRoundEliminations(player: Player, bot: Player): void {
    if (this.state !== 'ROUND_ACTIVE') return;

    if (player.isDead && bot.isDead) {
      this.lastRoundWinner = 'draw';
      this.transitionTo('ROUND_OVER', ROUND_OVER_DURATION);
    } else if (player.isDead) {
      this.botWins++;
      this.lastRoundWinner = 'bot';
      this.transitionTo('ROUND_OVER', ROUND_OVER_DURATION);
    } else if (bot.isDead) {
      this.playerWins++;
      this.lastRoundWinner = 'player';
      this.transitionTo('ROUND_OVER', ROUND_OVER_DURATION);
    }
  }

  forceRoundResult(winner: 'player' | 'bot'): void {
    if (this.state !== 'ROUND_ACTIVE' && this.state !== 'COUNTDOWN') return;
    if (winner === 'player') {
      this.playerWins++;
      this.lastRoundWinner = 'player';
    } else {
      this.botWins++;
      this.lastRoundWinner = 'bot';
    }
    this.transitionTo('ROUND_OVER', ROUND_OVER_DURATION);
  }

  completeIntermission(
    player: Player,
    bot: Player,
    world: PhysicsWorld,
    arena: ArenaShrink,
    hexCenter: Vector2D,
  ): void {
    if (this.state !== 'INTERMISSION_DRAFT') return;
    this.roundNumber++;
    this.resetRoundEntities(player, bot, world, arena, hexCenter);
    this.transitionTo('COUNTDOWN', COUNTDOWN_DURATION);
  }

  resetRoundEntities(
    player: Player,
    bot: Player,
    world: PhysicsWorld,
    arena: ArenaShrink,
    hexCenter: Vector2D,
  ): void {
    world.clearProjectilesAndZones();
    world.clearEventQueues();
    arena.reset();

    const playerSpawn = hexCenter.add(new Vector2D(-arena.initialRadius * 0.5, 0));
    const botSpawn = hexCenter.add(new Vector2D(arena.initialRadius * 0.5, 0));

    player.resetCombatState();
    player.resetPosition(playerSpawn);
    bot.resetCombatState();
    bot.resetPosition(botSpawn);

    this.ensurePlayerInWorld(world, player);
    this.ensurePlayerInWorld(world, bot);
  }

  private ensurePlayerInWorld(world: PhysicsWorld, combatant: Player): void {
    if (!world.players.includes(combatant)) {
      world.addPlayer(combatant);
    }
  }

  private transitionTo(state: MatchState, timer: number): void {
    this.state = state;
    this.stateTimer = timer;
    this.onStateChange?.(state);
  }
}
