import numpy as np
import gymnasium as gym
from gymnasium import spaces
from game2048 import Game2048


class Game2048Env(gym.Env):
    metadata = {"render_modes": ["human"]}

    def __init__(self):
        super().__init__()
        self.game = Game2048()
        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=(16,), dtype=np.float32
        )
        self.action_space = spaces.Discrete(4)

    def _obs(self):
        return (np.log2(self.game.board.flatten().astype(np.float32) + 1) / 17.0)

    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        if seed is not None:
            np.random.seed(seed)
        self.game.reset()
        return self._obs(), {}

    def step(self, action):
        prev_score = self.game.score
        _, changed = self.game.step(action)

        if not changed:
            reward = -1.0
        else:
            reward = float(self.game.score - prev_score)

        terminated = self.game.is_done()
        truncated = False
        info = {"score": self.game.score, "max_tile": self.game.max_tile}

        return self._obs(), reward, terminated, truncated, info

    def render(self):
        board = self.game.board
        print(f"Score: {self.game.score}  Max tile: {self.game.max_tile}")
        for row in board:
            print("\t".join(str(v) if v != 0 else "." for v in row))
        print()
