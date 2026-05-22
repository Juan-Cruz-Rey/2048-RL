import numpy as np


class Game2048:
    def __init__(self):
        self.board = np.zeros((4, 4), dtype=np.int64)
        self._score = 0
        self.reset()

    def reset(self):
        self.board = np.zeros((4, 4), dtype=np.int64)
        self._score = 0
        self._add_random_tile()
        self._add_random_tile()
        return self.board.copy()

    @property
    def score(self):
        return self._score

    @property
    def max_tile(self):
        return int(self.board.max())

    def _merge(self, row):
        tiles = row[row != 0]
        merged = []
        skip = False
        gain = 0
        for i in range(len(tiles)):
            if skip:
                skip = False
                continue
            if i + 1 < len(tiles) and tiles[i] == tiles[i + 1]:
                value = tiles[i] * 2
                merged.append(value)
                gain += value
                skip = True
            else:
                merged.append(tiles[i])
        result = np.zeros(4, dtype=np.int64)
        result[:len(merged)] = merged
        return result, gain

    def _add_random_tile(self):
        empty = list(zip(*np.where(self.board == 0)))
        if empty:
            r, c = empty[np.random.randint(len(empty))]
            self.board[r, c] = 4 if np.random.random() < 0.1 else 2

    def step(self, action):
        prev_board = self.board.copy()
        gain = 0

        if action == 0:
            for c in range(4):
                col, g = self._merge(self.board[:, c])
                self.board[:, c] = col
                gain += g
        elif action == 1:
            for c in range(4):
                col, g = self._merge(self.board[::-1, c])
                self.board[::-1, c] = col
                gain += g
        elif action == 2:
            for r in range(4):
                row, g = self._merge(self.board[r, :])
                self.board[r, :] = row
                gain += g
        elif action == 3:
            for r in range(4):
                row, g = self._merge(self.board[r, ::-1])
                self.board[r, ::-1] = row
                gain += g

        changed = not np.array_equal(self.board, prev_board)
        if changed:
            self._score += gain
            self._add_random_tile()

        return self.board.copy(), changed

    def is_done(self):
        if np.any(self.board == 0):
            return False
        for r in range(4):
            for c in range(3):
                if self.board[r, c] == self.board[r, c + 1]:
                    return False
        for c in range(4):
            for r in range(3):
                if self.board[r, c] == self.board[r + 1, c]:
                    return False
        return True
