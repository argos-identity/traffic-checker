
'use strict';
const { CloudWatchClient, GetMetricDataCommand } = require("@aws-sdk/client-cloudwatch")
var util = require('../common');
var logger = require('../logger');

// CORS 미들웨어 추가
const cors = require('cors');


const region = "us-east-1";
const client = new CloudWatchClient({ region });

// CORS 옵션 설정
const corsOptions = {
    origin: '*', // 모든 출처 허용
    methods: ['GET', 'POST'], // 허용할 HTTP 메서드
    allowedHeaders: ['Content-Type', 'Authorization','Application'] // 허용할 헤더
};

exports.trafficChecker = [
    cors(corsOptions), // CORS 미들웨어 적용
    async function(req, res) {
        logger.log('info', 'Starting traffic check for all load balancers');
        
        try {
            const idLiveDocTraffic = await checkIdLiveDocTraffic();
            const smartIdTraffic = await checkSmartIdTraffic();

            // 지연 시간 계산
            const idLiveDocDelay = calculateDelay(idLiveDocTraffic, 4);
            const smartIdDelay = calculateDelay(smartIdTraffic, 3);

            const totalDelay = Math.max(idLiveDocDelay, smartIdDelay);

            const response = {
                delaySeconds: Math.round(totalDelay)
                /*idLiveDoc: {
                    lb_name: "idLiveDoc",
                    requests: idLiveDocTraffic
                },
                smartId: {
                    lb_name: "smartId",
                    requests: smartIdTraffic
                }*/
            };
            return res.status(200).json(response);
        } catch (error) {
            logger.log('error', `Error in trafficChecker: ${error.toString()}`);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }
];


// 지연 시간 계산 함수
function calculateDelay(requestsPerMinute, processingTime) {
    const requestsPerSecond = requestsPerMinute / 60;
    const processingCapacity = 1 / processingTime; // 초당 처리 가능한 요청 수
    
    if (requestsPerSecond <= processingCapacity) {
        return 0; // 처리 능력이 충분하면 지연 없음
    }

    const unprocessedRequests = requestsPerSecond - processingCapacity;
    const delay = unprocessedRequests * processingTime;

    return delay;
}

// idLiveDoc 로드 밸런서 트래픽 체크
async function checkIdLiveDocTraffic() {
    const idLiveDoc = {
        arn: "arn:aws:elasticloadbalancing:us-east-1:823490195698:loadbalancer/app/idLiveDoc/2fe243e0487da131",
        name: "app/idLiveDoc/2fe243e0487da131"
    };
    return await checkLoadBalancerTraffic(idLiveDoc);
}

// smartId 로드 밸런서 트래픽 체크
async function checkSmartIdTraffic() {
    const smartId = {
        arn: "arn:aws:elasticloadbalancing:us-east-1:823490195698:loadbalancer/app/smartId/263e5cc08d54751d",
        name: "app/smartId/263e5cc08d54751d"
    };
    return await checkLoadBalancerTraffic(smartId);
}

// 각 로드 밸런서에 대한 트래픽을 확인하는 함수
async function checkLoadBalancerTraffic(lb) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 60000); // 1분 전

    const params = {
        MetricDataQueries: [
            {
                Id: "requests",
                MetricStat: {
                    Metric: {
                        Namespace: "AWS/ApplicationELB",
                        MetricName: "RequestCount",
                        Dimensions: [
                            {
                                Name: "LoadBalancer",
                                Value: lb.name
                            }
                        ]
                    },
                    Period: 60,  // 1분간
                    Stat: "Sum"
                }
            }
        ],
        StartTime: startTime,
        EndTime: endTime
    };

    try {
        const command = new GetMetricDataCommand(params);
        const response = await client.send(command);

        if (response.MetricDataResults && response.MetricDataResults.length > 0) {
            const requestsPerMinute = response.MetricDataResults[0].Values[0] || 0;

            logger.log('info', `Calculated requests per minute for ${lb.name} ==> ${requestsPerMinute}`);

            if (requestsPerMinute >= 50) {
                logger.log('warn', `[${new Date().toISOString()}] High traffic alert for ${lb.name}: ${requestsPerMinute.toFixed(2)} requests per minute`);
            }

            return Math.round(requestsPerMinute);  // 반올림하여 정수로 반환
        } else {
            logger.log('warn', `No metric data received for ${lb.name}`);
            return 0;
        }
    } catch (error) {
        logger.log('error', `Error fetching ALB traffic data for ${lb.name}: ${error.toString()}`);
        logger.log('error', `Error stack: ${error.stack}`);
        throw error;  // 에러를 상위로 전파
    }
}

// 예외 처리
process.on('uncaughtException', (error) => {
    logger.log('error', `Uncaught Exception: ${error.toString()}`);
    logger.log('error', `Error stack: ${error.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.log('error', `Unhandled Rejection at: ${promise}, reason: ${reason.toString()}`);
    if (reason instanceof Error) {
        logger.log('error', `Error stack: ${reason.stack}`);
    }
});

logger.log('info', 'Application started');