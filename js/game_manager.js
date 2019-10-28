function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
    this.blankTile   = new Tile(previousState.blankTile.position,
                                previousState.blankTile.value);
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;
    this.blankTile   = new Tile({x: Math.floor(this.size / 2), y: Math.floor(this.size / 2)}, null);

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  this.grid.insertTile(this.blankTile);

  for (var i = 0; i < this.size * this.size; i++) {
    var position = {x: Math.floor(i / this.size), y: i % this.size};
    if (position.x != this.blankTile.x || position.y != this.blankTile.y) {
      var value = 1 << (Math.floor(Math.random() * 5) + 1);
      var tile = new Tile(position, value);

      this.grid.insertTile(tile);
    }
  }

  this.generateAnswer(this.grid);
};

GameManager.prototype.generateAnswer = function (grid) {
  var cells = grid.coloredCells();
  while (cells.length > 3 * 3) {
    cells.splice(Math.floor(Math.random() * cells.length), 1);
  }

  var self = this;
  self.answer = new Grid(3);
  cells.forEach(function(tile, idx){
    var pos = {
      x: idx % 3, y: Math.floor(idx / 3)
    };
    self.answer.cells[pos.x][pos.y] = new Tile(pos, tile.value);
  });
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying,
    blankTile:   this.blankTile.serialize()
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var vector     = this.getVector(direction);

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  var position = this.findNextPosition(self.blankTile, vector);
  var tile     = self.grid.cellContent(position);
  if (tile && !this.positionsEqual(self.blankTile, tile)) {
    var previous = {x: self.blankTile.x, y: self.blankTile.y};
    this.moveTile(self.blankTile, position);
    this.moveTile(tile, previous);

    this.score += 1;

  if (moved) {
    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }
    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

GameManager.prototype.findNextPosition = function (cell, vector) {
  return { x: cell.x + vector.x, y: cell.y + vector.y };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};