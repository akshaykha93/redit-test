import { performance } from "perf_hooks";
import supertest from "supertest";
import { buildApp } from "./app";

const app = supertest(buildApp());
var assert = require('assert');


async function basicLatencyTest() {
    await app.post("/reset").expect(204);
    const start = performance.now();
    var isAuthorizedCount = 0;
    var minBalance = 100;
    var count = 0;
    for (var i =0; i < 12; i++) {
    app.post("/charge").expect(200).end((err, res:any) => {
        console.log(res.body);
        if(res.body.isAuthorized == true) {
            isAuthorizedCount++;
        }
        if(minBalance > res.body.remainingBalance) {
            minBalance = res.body.remainingBalance
        }
        count++;
       });
    }
    console.log("count:" + count);
    while (true) {
        while(count < 12) {
            await new Promise(r => setTimeout(r, 20));
        }
        console.log(`Latency: ${performance.now() - start} ms`);
        console.log("Last Balance:" + minBalance + " Total Auth Count:" + isAuthorizedCount);
        assert(minBalance == 0, "MinBalance should be 0");
        assert(isAuthorizedCount == 10, "count shoud be 10");
        break;
    }
}

async function runTests() {
    await basicLatencyTest();
}

runTests().catch(console.error);
