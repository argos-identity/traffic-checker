# Traffic Checker Application

Node.js 기반 AWS Application Load Balancer 트래픽 모니터링 애플리케이션

## 개요

이 애플리케이션은 AWS CloudWatch를 통해 Application Load Balancer의 실시간 메트릭을 수집하고, 현재 지연 시간을 계산하여 제공합니다.

## 주요 기능

- **ELB 메트릭 수집**: 6개의 주요 CloudWatch 메트릭 실시간 조회
- **지연 시간 계산**: 실제 응답 시간 기반 대기 시간 자동 계산
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
  "delaySeconds": 0,
  "elb": {
    "smartId": {
      "requestCount": 4,
      "targetResponseTime": 1.235,
      "activeConnectionCount": 33,
      "newConnectionCount": 40,
      "processedBytes": 7171325,
      "healthyHostCount": 0
    },
    "idLiveDoc": {
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
| `delaySeconds` | integer | 기준 처리 시간 대비 실제 지연 시간 (두 LB 중 최대값) | 초 |
| `elb` | object | Load Balancer 메트릭 객체 | - |
| `requestCount` | integer | 분당 평균 요청 수 (5분 합계 ÷ 5) | 개/분 |
| `targetResponseTime` | float | 평균 응답 시간 (소수점 3자리) | 초 |
| `activeConnectionCount` | integer | 현재 활성 연결 수 | 개 |
| `newConnectionCount` | integer | 새로 생성된 연결 수 | 개 |
| `processedBytes` | integer | 처리된 데이터량 | 바이트 |
| `healthyHostCount` | integer | 정상 타겟 수 | 개 |

### 헬스체크 엔드포인트
```
GET http://localhost:5050/server/state
GET http://localhost:5050/server/health
GET http://localhost:5050/server/ready
```

## 응답 예시

### 1. 정상 상태 (트래픽 낮음)
```json
{
  "delaySeconds": 0,
  "elb": {
    "smartId": {
      "requestCount": 4,
      "targetResponseTime": 1.235,
      "activeConnectionCount": 33,
      "newConnectionCount": 40,
      "processedBytes": 7171325,
      "healthyHostCount": 0
    },
    "idLiveDoc": {
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
**상태:** smartId 실제 응답 1.235초 < 기준 3초 → 지연 없음

---

### 2. 중간 부하 상태
```json
{
  "delaySeconds": 1,
  "elb": {
    "smartId": {
      "requestCount": 45,
      "targetResponseTime": 4.2,
      "activeConnectionCount": 180,
      "newConnectionCount": 250,
      "processedBytes": 52428800,
      "healthyHostCount": 2
    },
    "idLiveDoc": {
      "requestCount": 12,
      "targetResponseTime": 2.5,
      "activeConnectionCount": 65,
      "newConnectionCount": 85,
      "processedBytes": 15728640,
      "healthyHostCount": 3
    }
  }
}
```
**상태:** smartId 4.2초 - 3초 = **1.2초 지연**

---

### 3. 높은 부하 상태
```json
{
  "delaySeconds": 4,
  "elb": {
    "smartId": {
      "requestCount": 120,
      "targetResponseTime": 6.8,
      "activeConnectionCount": 450,
      "newConnectionCount": 680,
      "processedBytes": 157286400,
      "healthyHostCount": 3
    },
    "idLiveDoc": {
      "requestCount": 85,
      "targetResponseTime": 7.2,
      "activeConnectionCount": 320,
      "newConnectionCount": 520,
      "processedBytes": 104857600,
      "healthyHostCount": 2
    }
  }
}
```
**상태:** smartId 3.8초 지연, idLiveDoc 3.2초 지연 → **최대 4초**

---

### 4. 피크 타임 (매우 높은 부하)
```json
{
  "delaySeconds": 9,
  "elb": {
    "smartId": {
      "requestCount": 250,
      "targetResponseTime": 11.5,
      "activeConnectionCount": 890,
      "newConnectionCount": 1250,
      "processedBytes": 314572800,
      "healthyHostCount": 4
    },
    "idLiveDoc": {
      "requestCount": 180,
      "targetResponseTime": 9.3,
      "activeConnectionCount": 650,
      "newConnectionCount": 920,
      "processedBytes": 209715200,
      "healthyHostCount": 3
    }
  }
}
```
**상태:** smartId 8.5초 지연, idLiveDoc 5.3초 지연 → **심각한 과부하**

## delaySeconds 해석

| 값 | 의미 | 조치 |
|----|------|------|
| **0** | 정상 - 기준 시간 내 처리 중 | 모니터링 |
| **1-3** | 경미한 지연 - 약간의 부하 | 주의 관찰 |
| **4-7** | 중간 지연 - 상당한 부하 | 스케일 아웃 검토 |
| **8+** | 심각한 지연 - 과부하 상태 | 즉시 스케일 아웃 필요 |

## 지연 시간 계산 방식

```
delaySeconds = max(0, actualResponseTime - baselineProcessingTime)
```

- **smartId**: 기준 처리 시간 3초
- **idLiveDoc**: 기준 처리 시간 4초

**예시:**
- smartId 실제 응답 6.8초 - 기준 3초 = **3.8초 지연**
- idLiveDoc 실제 응답 2.5초 - 기준 4초 = **0초** (기준보다 빠름)
- 최종 delaySeconds = max(3.8, 0) = **4초** (반올림)

## 모니터링되는 Load Balancer

1. **smartId**
   - ARN: `arn:aws:elasticloadbalancing:us-east-1:823490195698:loadbalancer/app/smartId/263e5cc08d54751d`
   - 기준 처리 시간: 3초

2. **idLiveDoc**
   - ARN: `arn:aws:elasticloadbalancing:us-east-1:823490195698:loadbalancer/app/idLiveDoc/2fe243e0487da131`
   - 기준 처리 시간: 4초

## CloudWatch 메트릭 설정

- **Period**: 300초 (5분)
- **StartTime**: 현재 시간 - 5분
- **EndTime**: 현재 시간
- **Region**: us-east-1

### 수집 메트릭

| 메트릭 | 통계 | 설명 |
|--------|------|------|
| RequestCount | Sum | 요청 수 합계 (5분) → 분당 평균 변환 |
| TargetResponseTime | Average | 평균 응답 시간 |
| ActiveConnectionCount | Sum | 활성 연결 수 합계 |
| NewConnectionCount | Sum | 신규 연결 수 합계 |
| ProcessedBytes | Sum | 처리된 바이트 합계 |
| HealthyHostCount | Average | 정상 타겟 평균 수 |

## AWS IAM 권한

이 애플리케이션을 실행하려면 다음 CloudWatch 권한이 필요합니다:

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
- **AWS SDK (CloudWatch)**: 메트릭 수집
- **CORS**: 크로스 도메인 지원
- **Cluster**: 멀티 프로세스 실행

## 에러 처리

- 메트릭 데이터가 없는 경우 → 0 반환
- CloudWatch API 호출 실패 → 500 에러와 상세 메시지 반환
- 각 메트릭 누락 시 경고 로그 출력

## 로그

애플리케이션은 다음 정보를 로깅합니다:

```
info: Starting traffic check for all load balancers
info: Fetching all metrics for smartId
info: Fetching all metrics for idLiveDoc
info: Successfully fetched metrics for smartId
info: Successfully fetched metrics for idLiveDoc
info: Calculated delay - idLiveDoc: 0.000s, smartId: 0.000s
info: Response: {"delaySeconds":0,"elb":{...}}
```

경고 및 에러:
```
warn: No data for metric healthyHostCount on smartId
error: Error fetching metrics for smartId: ...
```

## 성능 최적화

- **병렬 쿼리**: Promise.all로 여러 LB 메트릭 동시 조회
- **Batch 쿼리**: 한 번의 API 호출로 6개 메트릭 조회
- **응답 시간**: 1-2초 이내 유지

## 버전 히스토리

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

## 문의

이슈나 문의사항은 프로젝트 관리자에게 연락하세요.
