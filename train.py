import json
import os
import numpy as np
import torch
from env import Game2048Env
from agent import DQNAgent


class _NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

NUM_EPISODES = 10000
SAVE_REPLAY_EVERY = 500
CHECKPOINT_EVERY = 1000
TARGET_UPDATE_EVERY = 500
PRINT_EVERY = 100

REPLAYS_DIR = "replays"
CHECKPOINTS_DIR = "checkpoints"

os.makedirs(REPLAYS_DIR, exist_ok=True)
os.makedirs(CHECKPOINTS_DIR, exist_ok=True)


def run_episode(env, agent, record=False):
    obs, _ = env.reset()
    done = False
    total_score = 0
    steps_log = []

    while not done:
        action = agent.select_action(obs)

        if record:
            board_snapshot = env.game.board.tolist()
            score_snapshot = env.game.score

        next_obs, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated
        changed = info["changed"]

        if record and changed:
            steps_log.append({
                "board": board_snapshot,
                "score": score_snapshot,
                "action": int(action),
            })

        agent.buffer.push(obs, action, reward, next_obs, float(done))
        agent.train_step()

        obs = next_obs
        total_score = info["score"]

    max_tile = info["max_tile"]
    return total_score, max_tile, steps_log


def main():
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    else:
        print("GPU not available — running on CPU")

    env = Game2048Env()
    agent = DQNAgent()

    all_scores = []
    all_max_tiles = []

    epoch_best_score = -1
    epoch_best_episode = -1
    epoch_best_max_tile = 0
    epoch_best_steps = []

    for episode in range(1, NUM_EPISODES + 1):
        epoch_num = (episode - 1) // SAVE_REPLAY_EVERY + 1
        is_last_in_epoch = (episode % SAVE_REPLAY_EVERY == 0)

        score, max_tile, steps_log = run_episode(env, agent, record=True)

        all_scores.append(score)
        all_max_tiles.append(max_tile)

        if score > epoch_best_score:
            epoch_best_score = score
            epoch_best_episode = episode
            epoch_best_max_tile = max_tile
            epoch_best_steps = steps_log

        if agent._step_count % TARGET_UPDATE_EVERY < agent.batch_size:
            agent.update_target()

        if episode % CHECKPOINT_EVERY == 0:
            checkpoint_path = os.path.join(CHECKPOINTS_DIR, f"checkpoint_ep{episode}.pt")
            agent.save(checkpoint_path)

        if is_last_in_epoch:
            replay_data = {
                "epoch": epoch_num,
                "episode": epoch_best_episode,
                "score": epoch_best_score,
                "max_tile": epoch_best_max_tile,
                "steps": epoch_best_steps,
            }
            replay_path = os.path.join(REPLAYS_DIR, f"epoch_{epoch_num * SAVE_REPLAY_EVERY}.json")
            with open(replay_path, "w") as f:
                json.dump(replay_data, f, cls=_NumpyEncoder)

            epoch_best_score = -1
            epoch_best_episode = -1
            epoch_best_max_tile = 0
            epoch_best_steps = []

        if episode % PRINT_EVERY == 0:
            recent_scores = all_scores[-PRINT_EVERY:]
            recent_tiles = all_max_tiles[-PRINT_EVERY:]
            avg_score = np.mean(recent_scores)
            avg_max_tile = np.mean(recent_tiles)
            print(
                f"Episode {episode:6d} | "
                f"Avg Score (last {PRINT_EVERY}): {avg_score:8.1f} | "
                f"Avg Max Tile: {avg_max_tile:6.1f} | "
                f"Epsilon: {agent.epsilon:.4f}"
            )

    agent.save(os.path.join(CHECKPOINTS_DIR, "final_model.pt"))

    stats = {
        "scores": all_scores,
        "max_tiles": all_max_tiles,
    }
    with open("training_stats.json", "w") as f:
        json.dump(stats, f, cls=_NumpyEncoder)

    print("Training complete. Stats saved to training_stats.json")


if __name__ == "__main__":
    main()
