var options = {
  width: 800,
  height: 600,
  velocity: 400,
  maxScore: 11,
  font: {font: '30px Helvetica Neue', fill: '#FFFFFF', align: 'center'}
};

var graphics = {
  ball: {
    url: 'graphics/ball.png',
  },
  paddle: {
    url: 'graphics/paddle.png'
  }
};

var game = new Phaser.Game(options.width, options.height, Phaser.AUTO, 'mvpong');

var mvpongState = function (game) {
  this.isStarted;
  this.isHost;
  this.playingAs;
  this.dividerLine;
  this.ai = {
    left: false,
    right: false
  }
  this.sprites = {
    ball: undefined,
    paddles: {
      left: undefined,
      right: undefined
    }
  };
  this.paddles = {
    left: {
      upKey: undefined,
      downKey: undefined
    },
    right: {
      upKey: undefined,
      downKey: undefined
    }
  };
  this.groups = {
    paddle : undefined
  };

  this.scores = {
    textFields: {
      left: '0',
      right: '0'
    },
    score: {
      left: 0,
      right: 0
    }
  }

  this.messages = {
    joinRoom: ''
  };
};

mvpongState.prototype = {
  preload: function () {
    for (var key in graphics) {
      game.load.image(key, graphics[key].url);
    }
    game.load.audio('hit', ['sounds/checkout.mp3']);
  },

  create: function () {
    this.setUpGraphics();
    this.setUpPhysics();
    this.setUpKeys();
    this.sounds = {
      hit: game.add.audio('hit')
    };
    if (!this.isHost) {
      // Register score update event handler.
      window.socket.on('score', function (data) {
        if (data.roomname === window.currentRoom) {
          this.scores.score.left = data.leftScore;
          this.scores.score.right = data.rightScore;
          this.updateScore();
        }
      }.bind(this));
    }
  },

  acceptRoomInvite: function (side, isHost, opponents) {
    this.messages.joinRoom.text = '';
    this.messages.roomName = game.add.text(window.options.width/2,  window.options.height*0.1, 'Room: ' + window.currentRoom, window.options.font);
    this.messages.roomName.anchor.set(0.5, 0.5);
    this.isHost = isHost;
    this.playingAs = side;
    this.opponents = opponents;
    if (this.isHost) {
      this.messages.joinRoom.text = 'Waiting for opponent...';
    } else {
      this.messages.joinRoom.text = '';
    }
    window.socket.emit('acceptedInvite', {
      username: window.username,
      roomname: window.currentRoom,
      side: side
    });
    if (this.isHost) {
      this.messages.addAI =  game.add.text(window.options.width/2,  window.options.height*0.7, 'Click to add a robot opponent!', window.options.font);
      this.messages.addAI.anchor.set(0.5, 0.5);
      this.messages.addAI.inputEnabled = true;
      this.messages.addAI.events.onInputDown.add(this.onAIDown.bind(this), this);
    }
  },

  onAIDown: function () {
    if (this.playingAs === 'left') {
      this.ai.right = true;
    } else if (this.playingAs === 'right') {
      this.ai.left = true;
    }
    this.messages.joinRoom.text = '';
    this.messages.addAI.text = '';
    this.updateScore();
    this.launchBall();
  },

  update: function () {
    if (window.currentRoom !== undefined) {
      this.leftPaddleHandler();
      this.rightPaddleHandler();
      game.physics.arcade.overlap(this.groups.paddle, this.sprites.ball, this.paddleOverlapHandler, null, this);
      this.emitPosition();
      if (!this.isHost) {
        this.updatePositions();
      } else {
        this.checkStart();
      }
    }
  },

  updatePositions: function () {
    window.socket.on('position', function (data) {
      if (data.player === this.playingAs) {
        return;
      }
      if (this.sprites.paddles[data.player] !== undefined) {
        this.sprites.paddles[data.player].y = data.position.y;
      }
      if (this.sprites.ball.x !== undefined && this.sprites.ball.y !== undefined) {
        this.sprites.ball.x = data.ball.x;
        this.sprites.ball.y = data.ball.y;
      }
    }.bind(this));
  },

  emitPosition: function () {
    window.socket.emit('position', {
      player: this.playingAs,
      position: {
        y: this.sprites.paddles[this.playingAs].y
      },
      ball: {
        x: this.sprites.ball.x,
        y: this.sprites.ball.y
      }
    });
  },

  setUpKeys: function () {
    this.paddles.left.upKey = game.input.keyboard.addKey(Phaser.Keyboard.F);
    this.paddles.left.downKey = game.input.keyboard.addKey(Phaser.Keyboard.V);
    this.paddles.right.upKey = game.input.keyboard.addKey(Phaser.Keyboard.J);
    this.paddles.right.downKey = game.input.keyboard.addKey(Phaser.Keyboard.N);
  },

  setUpPhysics: function () {
    game.physics.startSystem(Phaser.Physics.ARCADE);
    game.physics.enable(this.sprites.ball, Phaser.Physics.ARCADE);

    // dispatch event when leaving the world bounds for counting scores.
    this.sprites.ball.checkWorldBounds = true;
    // bounce the ball sprite back into game world on boundaries.
    this.sprites.ball.body.collideWorldBounds = true;
    // Full rebound -- keeps same velocity when colliding with another object.
    this.sprites.ball.body.bounce.set(1);
    this.sprites.ball.body.immovable = true;
    this.sprites.ball.events.onOutOfBounds.add(this.ballOutsideHandler, this);

    this.groups.paddle = game.add.group();
    this.groups.paddle.enableBody = true;
    this.groups.paddle.physicsBodyType = Phaser.Physics.ARCADE;

    this.groups.paddle.add(this.sprites.paddles.left);
    this.groups.paddle.add(this.sprites.paddles.right);
    this.groups.paddle.setAll('checkWorldBounds', true);
    this.groups.paddle.setAll('body.collideWorldBounds', true);
    this.groups.paddle.setAll('body.immovable', true);

    game.physics.arcade.checkCollision.left = false;
    game.physics.arcade.checkCollision.right = false;

  },

  launchBall: function () {
    this.sprites.ball.reset(window.options.width / 2, window.options.height / 2);
    var max = 1/3 * Math.PI;
    var min = -1/3 * Math.PI;
    var random = Math.random();
    if (random < .25) {
      max = Math.PI;
      min = 2/3 * Math.PI;
    } else if (random > .75) {
      max = -Math.PI;
      min = -2/3 * Math.PI;
    }
    var radians = Math.random() * (max - min) + min;
    game.physics.arcade.velocityFromRotation(radians, window.options.velocity, this.sprites.ball.body.velocity);
  },

  leftPaddleHandler: function () {
    if (this.ai.left === true) {
       // Dumb AI
      if (Math.abs(this.sprites.paddles.left.y - this.sprites.ball.y) < 10) {
        this.sprites.paddles.left.body.velocity.y = 0;
      }
      if (this.sprites.paddles.left.y > this.sprites.ball.y) {
        window.movingUp = true;
        setTimeout(function () {
          window.movingUp = undefined;
        }, 130);
        if (!window.movingDown) {
          this.sprites.paddles.left.body.velocity.y = -500;
        }
      } else {
        window.movingDown = true;
        setTimeout(function () {
          window.movingDown = undefined;
        }, 150);
        if (!window.movingUp) {
          this.sprites.paddles.left.body.velocity.y = 500;
        }
      }
    } else {
      if (this.paddles.left.upKey.isDown) {
        this.sprites.paddles.left.body.velocity.y = -500;
      } else if (this.paddles.left.downKey.isDown) {
        this.sprites.paddles.left.body.velocity.y = 500;
      } else {
        this.sprites.paddles.left.body.velocity.y = 0;
      }
    }
  },

  rightPaddleHandler: function () {
    if (this.ai.right === true) {
      // Dumb AI
      if (Math.abs(this.sprites.paddles.right.y - this.sprites.ball.y) < 10) {
        this.sprites.paddles.right.body.velocity.y = 0;
      }
      if (this.sprites.paddles.right.y > this.sprites.ball.y) {
        window.movingUp = true;
        setTimeout(function () {
          window.movingUp = undefined;
        }, 130);
        if (!window.movingDown) {
          this.sprites.paddles.right.body.velocity.y = -500;
        }
      } else {
        window.movingDown = true;
        setTimeout(function () {
          window.movingDown = undefined;
        }, 150);
        if (!window.movingUp) {
          this.sprites.paddles.right.body.velocity.y = 500;
        }
      }
    } else {
      if (this.paddles.right.upKey.isDown) {
        this.sprites.paddles.right.body.velocity.y = -500;
      } else if (this.paddles.right.downKey.isDown) {
        this.sprites.paddles.right.body.velocity.y = 500;
      } else {
        this.sprites.paddles.right.body.velocity.y = 0;
      }
    }
  },

  paddleOverlapHandler: function (paddle, ball) {
    var radians;
    // cut paddle in 20
    // assumes the paddle is 60 px, every part is 3px
    var paddleHeight = 60;
    var part = Math.floor((ball.y - paddle.y)/(paddleHeight/20));

    if (paddle.x < window.options.width/2) {
      // left paddle
      radians = part * 0.1;
    } else {
      // right paddle
      radians = Math.PI - (part * 0.1);
      if (radians > Math.PI) {
        radians -= Math.PI * 2;
      }
    }
    game.physics.arcade.velocityFromRotation(radians, window.options.velocity, this.sprites.ball.body.velocity);
    this.sounds.hit.play();

    document.body.classList.add("shake");
    setTimeout(function () {
      document.body.classList.remove("shake");
    }, 500);

  },

  setUpGraphics: function () {
    // Set up divider line
    this.dividerLine = game.add.graphics(0, 0);
    this.dividerLine.lineStyle(2, 0xFFFFFF, 1);

    for (var y = 0; y < window.options.height; y += 10) {
      this.dividerLine.moveTo(window.options.width/2, y)
      y += 10;
      this.dividerLine.lineTo(window.options.width/2, y);
    }

    // Set up ball sprite
    this.sprites.ball = game.add.sprite(window.options.width/2, window.options.height/2, 'ball');
    this.sprites.ball.anchor.set(0.5, 0.5);

    // Set up left paddle sprite
    this.sprites.paddles.left = game.add.sprite(window.options.width/60, window.options.height/2, 'paddle');
    this.sprites.paddles.left.anchor.set(0.5, 0.5);

    // Set up right paddle sprite
    this.sprites.paddles.right = game.add.sprite(window.options.width/60*59, window.options.height/2, 'paddle');
    this.sprites.paddles.right.anchor.set(0.5, 0.5);

    // Set up scores
    this.scores.textFields.left = game.add.text(window.options.width/4, window.options.height/10, '', window.options.font);
    this.scores.textFields.left.anchor.set(0.5, 0.5);
    this.scores.textFields.right = game.add.text(window.options.width/4*3, window.options.height/10, '', window.options.font);
    this.scores.textFields.right.anchor.set(0.5, 0.5);

    // Ask user to join a room.
    this.messages.joinRoom = game.add.text(window.options.width/2,  window.options.height*0.3, 'Please join a room...', window.options.font);
    this.messages.joinRoom.anchor.set(0.5, 0.5);
  },

  ballOutsideHandler: function () {
    if (this.isHost) {
      if (this.sprites.ball.x <= 0) {
        this.scores.score.right++;
      }
      if (this.sprites.ball.x >= window.options.width) {
        this.scores.score.left++;
      }
      window.socket.emit('score', {
        roomname: window.currentRoom,
        leftScore: this.scores.score.left,
        rightScore: this.scores.score.right
      });
      this.updateScore();
    }

    if (this.scores.score.left === window.options.maxScore) {
      alert('left wins!');
      this.scores.score.left = 0;
      this.scores.score.right = 0;
      this.updateScore();
    }
    if (this.scores.score.right === window.options.maxScore) {
      alert('right wins!');
      this.scores.score.left = 0;
      this.scores.score.right = 0;
      this.updateScore();
    }

    if (this.isHost) {
      this.launchBall();
    }
  },

  updateScore: function () {
    this.scores.textFields.left.text = this.scores.score.left;
    this.scores.textFields.right.text = this.scores.score.right;
    if (this.playingAs === 'left') {
      this.scores.textFields.left.text = 'You: ' + this.scores.textFields.left.text;
      if (this.opponents.right) {
        this.scores.textFields.right.text = filterXSS(this.opponents.right) + ': ' + this.scores.textFields.right.text;
      }
    } else if (this.playingAs === 'right') {
      this.scores.textFields.right.text = 'You: ' + this.scores.textFields.right.text;
      if (this.opponents.left) {
        this.scores.textFields.left.text = filterXSS(this.opponents.left) + ': ' + this.scores.textFields.left.text;
      }
    }
    if (this.ai.left === true) {
      this.scores.textFields.left.text = 'Robot: ' + this.scores.textFields.left.text;
    } else if (this.ai.right === true) {
      this.scores.textFields.right.text = 'Robot: ' + this.scores.textFields.right.text;
    }
  },

  // Host starts the game when the room is full.
  checkStart: function () {
    var otherSide;
    if (this.playingAs === 'left') {
      otherSide = 'right';
    } else if (this.playingAs === 'right') {
      otherSide = 'left';
    }
    if (this.isHost && !this.isStarted && this.opponents && this.opponents[otherSide]) {
      this.messages.joinRoom.text = '';
      this.messages.addAI.text = '';
      this.isStarted = true;
      this.updateScore();
      this.launchBall();
    }
  }

};

game.state.add('mvpong', mvpongState);
game.state.start('mvpong');
