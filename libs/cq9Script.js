const fetch = require('node-fetch');
const cq9ApiUrl = 'http://api.cqgame.games';

async function getGameList() {
    const option = {
        method: 'GET',
        headers: {
            'Authorization': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyaWQiOiI1ZDIyZjBkOWEwMzJjMzAwMDEwM2IyZmQiLCJhY2NvdW50IjoiR1NUX3N3Iiwib3duZXIiOiI1ZDIyZjBkOWEwMzJjMzAwMDEwM2IyZmQiLCJwYXJlbnQiOiJzZWxmIiwiY3VycmVuY3kiOiJDTlkiLCJqdGkiOiI0MDk0MzAxOTgiLCJpYXQiOjE1NjI1NzA5NjksImlzcyI6IkN5cHJlc3MiLCJzdWIiOiJTU1Rva2VuIn0.-s85HYXcvad21aXm7Hp0z7X4SJTbKGa7Fbmu_18F700',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };

    let result = await fetch(`${cq9ApiUrl}/gameboy/game/list/cq9`, option);
    result = await result.json();

    const types = [];
    const gameList = result.data;
    gameList.forEach(element => {
        if (!types.includes(element.gametype)) types.push(element.gametype);
    });
    gameList.forEach(element => {
        if (element.gametype === 'table') console.log(element);
    });
    console.log(types);
}

getGameList();