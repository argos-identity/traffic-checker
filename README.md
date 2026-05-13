# Traffic Checker Application

Node.js 기반 AWS Application Load Balancer 트래픽 모니터링 애플리케이션

## 개요

AWS CloudWatch를 통해 Application Load Balancer의 실시간 메트릭을 수집하고, 기준 처리 시간 대비 지연 시간을 계산하여 제공합니다.

## 주요 기능

- **ELB 메트릭 수집**: 6개의 주요 CloudWatch 메트릭 실시간 조회
- **지연 시간 계산**: 실제 응답 시간 기반 대기 시간 자동 계산 (Math.ceil 정수 올림)
- **병렬 처리**: 여러 Load Balancer 메트릭을 동시에 조회하여 성능 최적화
- **CORS 지원**: 크로스 도메인 요청 허용

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 실행 방법

**Cluster Mode (권장):**
```bash
node www
```

**Single Mode:**
```bash
node server.js
```

서버는 기본적으로 **포트 5050**에서 실행됩니다.

## API 엔드포인트

### 트래픽 체크
```
GET http://localhost:5050/
```

#### 응답 구조
```json
{
  "delaySeconds": 1,
  "elb": {
    "ocr": {
      "requestCount": 2,
      "targetResponseTime": 0.881,
      "activeConnectionCount": 2,
      "newConnectionCount": 18,
      "processedBytes": 2517255,
      "healthyHostCount": 3
    },
    "idcard": {
      "requestCount": 0,
      "targetResponseTime": 0,
      "activeConnectionCount": 0,
      "newConnectionCount": 0,
      "processedBytes": 0,
      "healthyHostCount": 0
    }
  }
}
```

#### 응답 필드 설명

| 필드 | 타입 | 설명 | 단위 |
|------|------|------|------|
| `delaySeconds` | integer | 기준 처리 시간 대비 지연 시간 (두 LB 중 최대값, Math.ceil 올림) | 초 |
| `elb` | object | Load Balancer 메트릭 객체 | - |
| `requestCount` | integer | 분당 평균 요청 수 (5분 합계 ÷ 5) | 개/분 |
| `targetResponseTime` | float | 평균 응답 시간 (소수점 3자리) | 초 |
| `activeConnectionCount` | integer | 현재 활성 연결 수 평균 | 개 |
| `newConnectionCount` | integer | 새로 생성된 연결 수 합계 | 개 |
| `processedBytes` | integer | 처리된 데이터량 합계 | 바이트 |
| `healthyHostCount` | integer | 정상 타겟 수 (0이면 fail-open 상태) | 개 |

### 헬스체크 엔드포인트
```
GET http://localhost:5050/server/state
GET http://localhost:5050/server/health
GET http://localhost:5050/server/ready
```

## delaySeconds 해석

```
delaySeconds = Math.ceil(max(0, actualResponseTime - baselineProcessingTime))
```

- **ocr (smartId)**: 기준 처리 시간 0.5초
- **idcard (idLiveDoc)**: 기준 처리 시간 0.5초

| 값 | 의미 | 조치 |
|----|------|------|
| **0** | 정상 - 기준 시간(0.5s) 내 처리 중 | 모니터링 |
| **1-3** | 경미한 지연 - 약간의 부하 | 주의 관찰 |
| **4-7** | 중간 지연 - 상당한 부하 | 스케일 아웃 검토 |
| **8+** | 심각한 지연 - 과부하 상태 | 즉시 스케일 아웃 필요 |

**예시:**
- ocr 실제 응답 0.881초 - 기준 0.5초 = 0.381초 지연 → `Math.ceil(0.381) = 1`
- ocr 실제 응답 0.3초 - 기준 0.5초 = -0.2초 → `Math.max(0, -0.2) = 0`

## healthyHostCount 해석

| 값 | 의미 |
|----|------|
| **1 이상** | 정상 — healthy target이 존재 |
| **0** | 위험 — 모든 target이 unhealthy. ALB가 fail-open으로 동작하여 unhealthy target에도 트래픽 라우팅 |

## 모니터링되는 Load Balancer

1. **ocr (smartId)**
   - LB ARN: `arn:aws:elasticloadbalancing:us-east-1:823490195698:loadbalancer/app/smartId/263e5cc08d54751d`
   - TG ARN: `arn:aws:elasticloadbalancing:us-east-1:823490195698:targetgroup/smartId/cb2c617ed8741279`
   - 기준 처리 시간: 0.5초
   - 역할: OCR 처리

2. **idcard (idLiveDoc)**
   - LB ARN: `arn:aws:elasticloadbalancing:us-east-1:823490195698:loadbalancer/app/idLiveDoc/2fe243e0487da131`
   - TG ARN: `arn:aws:elasticloadbalancing:us-east-1:823490195698:targetgroup/idLiveDoc/7c5549444f8a86b4`
   - 기준 처리 시간: 0.5초
   - 역할: 신분증 처리

## CloudWatch 메트릭 설정

- **Period**: 300초 (5분)
- **StartTime**: 현재 시간 - 15분 (완성된 period 데이터 확보)
- **EndTime**: 현재 시간
- **ScanBy**: TimestampDescending (Values[0]이 항상 최신값)
- **Region**: us-east-1

### 수집 메트릭

| 메트릭 | Stat | 설명 |
|--------|------|------|
| RequestCount | Sum | 5분 합계 → 분당 평균(÷5) 변환 |
| TargetResponseTime | Average | 평균 응답 시간 |
| ActiveConnectionCount | Average | 활성 연결 수 평균 |
| NewConnectionCount | Sum | 신규 연결 수 합계 |
| ProcessedBytes | Sum | 처리된 바이트 합계 |
| HealthyHostCount | Average | 정상 타겟 수 평균 (Dimension: LoadBalancer + TargetGroup) |

> **참고**: `HealthyHostCount`는 ALB에서 `LoadBalancer` + `TargetGroup` Dimension 조합으로만 발행됩니다. `LoadBalancer` 단독 조회 시 데이터가 반환되지 않습니다.

## AWS IAM 권한

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricData"
      ],
      "Resource": "*"
    }
  ]
}
```

## 환경 설정

### 포트 설정
`config/config.json` 파일에서 포트를 변경할 수 있습니다:
```json
{
  "dev": true,
  "host": "0.0.0.0",
  "port": 5050,
  "namespace": "dev"
}
```

### AWS 자격 증명
AWS SDK는 다음 순서로 자격 증명을 찾습니다:
1. 환경 변수 (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. AWS credentials 파일 (`~/.aws/credentials`)
3. IAM 역할 (EC2 인스턴스에서 실행 시)

## 기술 스택

- **Node.js**: 런타임 환경
- **Express**: 웹 프레임워크
- **AWS SDK v3 (CloudWatch)**: 메트릭 수집
- **CORS**: 크로스 도메인 지원
- **Cluster**: 멀티 프로세스 실행

## 에러 처리

- 메트릭 데이터가 없는 경우 → 0 반환
- CloudWatch API 호출 실패 → 500 에러와 상세 메시지 반환
- 각 메트릭 누락 시 경고 로그 출력

## 버전 히스토리

### v3.0.0 (2026-05-13)
- CloudWatch 조회 window 5분 → 15분 확장 (완성된 period 데이터 보장)
- ScanBy: TimestampDescending 추가 (최신값 보장)
- processingTime 기준값 1.0s → 0.5s 조정
- delaySeconds 소수점 → 정수 올림(Math.ceil) 변환
- activeConnectionCount Stat Sum → Average 수정
- healthyHostCount Dimension에 TargetGroup 추가 (LoadBalancer 단독 조회 버그 수정)

### v2.0.0 (2025-02-09)
- ELB 6개 메트릭 추가 수집
- 실제 응답 시간 기반 지연 계산 방식 개선
- 병렬 메트릭 조회로 성능 최적화
- 응답 구조 변경 (elb 객체 추가)

### v1.0.0
- 초기 버전
- RequestCount 기반 트래픽 체크

## 라이선스

MIT
