const app = require('express')();
const http = require('http').Server(app);
let io = require("socket.io")(http, {
    cors: {
        origin: "*",
    }
});

const port = process.env.PORT || 3000;
const rooms = [];

function getRoom(req) {
    return rooms.filter(r => r.roomCode === req.roomCode)[0];
}

app.get('/', (req, res) => {
  res.send('<h1>Sanka Admin Panel</h1>');
});

io.on('connection', (socket) => {
    console.log(`user ${socket.id} connected`);

    socket.on("disconnect", function() {
        console.log(`user ${socket.id} disconnected`);
        var roomIndex = rooms.map(r => r.users.filter(u => u.id === socket.id).length > 0).indexOf(true);
        var room = rooms[roomIndex];
    
        if (room) {
            const position = parseInt(room.users.map(e => e.id).indexOf(socket.id));
            room.users.splice(position, 1);
        
            if (room.users.length === 0) {
                console.log(`no users remain in ${room.roomCode}. Closing room.`);
                rooms.splice(roomIndex, 1);
            }
        
            io.in(room.roomCode.toUpperCase()).emit('room-update', room);
        }
    
      });

    socket.on("create", req => {
        console.log(`User ${req.name} / ${socket.id} created room ${req.roomCode}`);
        
        socket.join(req.roomCode);

        let room = { roomCode: req.roomCode, users: [{ name: req.name, id: socket.id, doneSubmitting: false, doneVoting: false }], kaizens: [] }
        
        rooms.push(room);

        socket.emit('join-success', socket.id);
        io.in(room.roomCode.toUpperCase()).emit('room-update', room);
    });

    socket.on("join", req => {
        console.log(`User joining: ${req.name} / ${socket.id}`);
        
        let room = getRoom(req)
        if (!room) {
            socket.emit('error', { type: "RoomNotFound", message: `Room ${req.roomCode} not found` });
            return;
        }
        socket.join(req.roomCode);

        room.users.push({ name: req.name, id: socket.id } );

        socket.emit('join-success', socket.id);
        io.in(room.roomCode.toUpperCase()).emit('room-update', room);
    });

    socket.on("new-kaizen", req => {
        console.log(JSON.stringify(req));

        let room = getRoom(req);
        room.kaizens.push(req.kaizen);

        io.in(room.roomCode.toUpperCase()).emit('room-update', room);
    });

    socket.on('nudge', req => {
        let room = getRoom(req);

        console.log(`${socket.id} is nudging ${req.userId}`);

        io.to(req.userId).emit(`nudge`);
    })

    socket.on('done-submitting', req => {
        let room = getRoom(req);

        console.log(`done request: ${JSON.stringify(req)}`);

        let user = room.users.filter(u => u.id === socket.id)[0];
        user.doneSubmitting = req.done;

        if (room.users.filter(u => !u.doneSubmitting).length === 0) {
            io.in(room.roomCode.toUpperCase()).emit('ready-to-vote');
        }

        console.log(`room updated: ${JSON.stringify(room)}`);

        io.in(room.roomCode.toUpperCase()).emit('room-update', room);
    });

    socket.on('vote', req => {
        let room = getRoom(req);

        console.log(JSON.stringify(room));

        switch(req.direction) {
            case 'up':
                room.kaizens.find(k => k.id === req.kaizenId).votes++;
                break;
            case 'down':
                room.kaizens.find(k => k.id === req.kaizenId).votes--;
                break;
        }


        io.in(room.roomCode.toUpperCase()).emit('room-update', room);
    });

    socket.on('done-voting', req => {
        let room = getRoom(req);

        console.log(JSON.stringify(room));

        let user = room.users.filter(u => u.id === socket.id)[0];
            user.doneVoting = true;

        req.maps.forEach(map => {
            room.kaizens.find(k => k.id === map.id).votes += map.votes
        });

        if (room.users.filter(u => !u.doneVoting).length > 0) {
            socket.emit('waiting');
            io.in(room.roomCode.toUpperCase()).emit('users-update', room.users);
        } else {
            io.in(room.roomCode.toUpperCase()).emit('room-update', room);
            io.in(room.roomCode.toUpperCase()).emit('voting-finished', room);
        }

    });
      
  });

http.listen(port, () => {
  console.log(`listening on *:${port}`);
});


