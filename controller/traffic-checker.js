
'use strict';
const { CloudWatchClient, GetMetricDataCommand } = require("@aws-sdk/client-cloudwatch")
var util = require('../common');
var logger = require('../logger');

const region = "us-east-1";
const client = new CloudWatchClient({ region });

// Load Balancer 설정
const LOAD_BALANCERS = {
    smartId: {
        arn: "arn:aws:elasticloadbalancing:us-east-1:823490195698:loadbalancer/app/smartId/263e5cc08d54751d",
        name: "app/smartId/263e5cc08d54751d",
        targetGroup: "targetgroup/smartId/cb2c617ed8741279",
        processingTime: 0.5
    },
    idLiveDoc: {
        arn: "arn:aws:elasticloadbalancing:us-east-1:823490195698:loadbalancer/app/idLiveDoc/2fe243e0487da131",
        name: "app/idLiveDoc/2fe243e0487da131",
        targetGroup: "targetgroup/idLiveDoc/7c5549444f8a86b4",
        processingTime: 0.5
    }
};

exports.trafficChecker = async function(req, res) {
        logger.log('info', 'Starting traffic check for all load balancers');

        try {
            // 1. 2개 LB의 메트릭을 병렬로 조회
            const [smartIdMetrics, idLiveDocMetrics] = await Promise.all([
                fetchAllMetricsForLoadBalancer('smartId', LOAD_BALANCERS.smartId),
                fetchAllMetricsForLoadBalancer('idLiveDoc', LOAD_BALANCERS.idLiveDoc)
            ]);

            logger.log('info', `Fetched metrics - smartId: ${JSON.stringify(smartIdMetrics)}`);
            logger.log('info', `Fetched metrics - idLiveDoc: ${JSON.stringify(idLiveDocMetrics)}`);

            // 2. 실제 대기 시간 계산 (targetResponseTime 활용)
            const idLiveDocDelay = calculateActualDelay(
                idLiveDocMetrics.targetResponseTime,
                LOAD_BALANCERS.idLiveDoc.processingTime
            );
            const smartIdDelay = calculateActualDelay(
                smartIdMetrics.targetResponseTime,
                LOAD_BALANCERS.smartId.processingTime
            );

            logger.log('info', `Calculated delay - idLiveDoc: ${idLiveDocDelay.toFixed(3)}s, smartId: ${smartIdDelay.toFixed(3)}s`);

            const totalDelay = Math.max(idLiveDocDelay, smartIdDelay);

            // 3. 응답 구성
            const response = {
                delaySeconds: 0,
                elb: {
                    ocr: smartIdMetrics,
                    idcard: idLiveDocMetrics
                }
            };

            logger.log('info', `Response: ${JSON.stringify(response)}`);
            return res.status(200).json(response);

        } catch (error) {
            logger.log('error', `Error in trafficChecker: ${error.toString()}`);
            logger.log('error', `Error stack: ${error.stack}`);
            return res.status(500).json({
                error: "Internal Server Error",
                message: error.message
            });
        }
};


// 단일 LB의 모든 메트릭 조회
async function fetchAllMetricsForLoadBalancer(lbKey, lbConfig) {
    logger.log('info', `Fetching all metrics for ${lbKey}`);

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 900000); // 15분 전 (완성된 period 데이터 확보)

    const params = {
        MetricDataQueries: [
            {
                Id: "requestCount",
                MetricStat: {
                    Metric: {
                        Namespace: "AWS/ApplicationELB",
                        MetricName: "RequestCount",
                        Dimensions: [{ Name: "LoadBalancer", Value: lbConfig.name }]
                    },
                    Period: 300,
                    Stat: "Sum"
                }
            },
            {
                Id: "targetResponseTime",
                MetricStat: {
                    Metric: {
                        Namespace: "AWS/ApplicationELB",
                        MetricName: "TargetResponseTime",
                        Dimensions: [{ Name: "LoadBalancer", Value: lbConfig.name }]
                    },
                    Period: 300,
                    Stat: "Average"
                }
            },
            {
                Id: "activeConnectionCount",
                MetricStat: {
                    Metric: {
                        Namespace: "AWS/ApplicationELB",
                        MetricName: "ActiveConnectionCount",
                        Dimensions: [{ Name: "LoadBalancer", Value: lbConfig.name }]
                    },
                    Period: 300,
                    Stat: "Average"
                }
            },
            {
                Id: "newConnectionCount",
                MetricStat: {
                    Metric: {
                        Namespace: "AWS/ApplicationELB",
                        MetricName: "NewConnectionCount",
                        Dimensions: [{ Name: "LoadBalancer", Value: lbConfig.name }]
                    },
                    Period: 300,
                    Stat: "Sum"
                }
            },
            {
                Id: "processedBytes",
                MetricStat: {
                    Metric: {
                        Namespace: "AWS/ApplicationELB",
                        MetricName: "ProcessedBytes",
                        Dimensions: [{ Name: "LoadBalancer", Value: lbConfig.name }]
                    },
                    Period: 300,
                    Stat: "Sum"
                }
            },
            {
                Id: "healthyHostCount",
                MetricStat: {
                    Metric: {
                        Namespace: "AWS/ApplicationELB",
                        MetricName: "HealthyHostCount",
                        Dimensions: [
                            { Name: "LoadBalancer", Value: lbConfig.name },
                            { Name: "TargetGroup",  Value: lbConfig.targetGroup }
                        ]
                    },
                    Period: 300,
                    Stat: "Average"
                }
            }
        ],
        StartTime: startTime,
        EndTime: endTime,
        ScanBy: "TimestampDescending"
    };

    try {
        const command = new GetMetricDataCommand(params);
        const response = await client.send(command);

        if (!response.MetricDataResults || response.MetricDataResults.length === 0) {
            logger.log('warn', `No metric data received for ${lbKey}`);
            return {
                requestCount: 0,
                targetResponseTime: 0,
                activeConnectionCount: 0,
                newConnectionCount: 0,
                processedBytes: 0,
                healthyHostCount: 0
            };
        }

        // 결과 파싱
        const metrics = {};
        response.MetricDataResults.forEach(result => {
            const value = result.Values[0];
            metrics[result.Id] = value !== undefined ? value : 0;

            if (value === undefined) {
                logger.log('warn', `No data for metric ${result.Id} on ${lbKey}`);
            }
        });

        // requestCount는 분당 평균으로 변환 (5분 합계 / 5)
        metrics.requestCount = Math.round(metrics.requestCount / 5);

        // targetResponseTime은 소수점 3자리로 반올림
        metrics.targetResponseTime = parseFloat(metrics.targetResponseTime.toFixed(3));

        // 나머지 메트릭은 정수로 반올림
        metrics.activeConnectionCount = Math.round(metrics.activeConnectionCount);
        metrics.newConnectionCount = Math.round(metrics.newConnectionCount);
        metrics.processedBytes = Math.round(metrics.processedBytes);
        metrics.healthyHostCount = Math.round(metrics.healthyHostCount);

        logger.log('info', `Successfully fetched metrics for ${lbKey}`);

        return metrics;

    } catch (error) {
        logger.log('error', `Error fetching metrics for ${lbKey}: ${error.toString()}`);
        logger.log('error', `Error stack: ${error.stack}`);
        throw error;
    }
}

// 실제 대기 시간 계산 함수
// 실제 응답 시간과 기준 처리 시간의 차이로 지연 시간 계산
function calculateActualDelay(actualResponseTime, baselineProcessingTime) {
    const delay = actualResponseTime - baselineProcessingTime;
    return Math.max(0, delay); // 음수면 0으로 (기준보다 빠른 경우)
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