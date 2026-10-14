# 청평 스마트스포츠 — 작업 안내서

청평초 스마트스포츠실과 집에서 학생이 태블릿으로 운동하고 기록하는 웹앱 모음입니다.
화면은 GitHub Pages(PWA), 기록은 Google Apps Script(GAS)를 거쳐 구글 시트에 쌓입니다.
작업을 시작할 때 이 파일을, 끝낼 때 `DEVLOG.md`를 꼭 갱신합니다.

## 앱 주소

| 앱 | 화면 주소 | 저장 시트 | 방식 |
|---|---|---|---|
| 허브 | https://leejk37.github.io/sports/ | 허브로그인 · 입퇴실 | QR 로그인 → 운동 선택 (공용 모드에서는 로그인=입실, 로그아웃=퇴실) |
| 스쿼트 | …/sports/squat/ | 스쿼트 | 카메라(MediaPipe) |
| 윗몸말아올리기 | …/sports/curlup/ | 윗몸말아올리기 | 카메라 |
| 점핑잭 | …/sports/jumpingjack/ | 점핑잭 | 카메라 |
| 런지 | …/sports/lunge/ | 런지 | 카메라 |
| 팔굽혀펴기 | …/sports/pushup/ | 팔굽혀펴기 | 카메라 (일반·무릎 대고) |
| 플랭크 | …/sports/plank/ | 플랭크 | 카메라 (바른 자세로 버틴 시간) |
| 트레드밀 | …/sports/treadmill/ | 트레드밀 | 타이머 + 화면 숫자 입력 |
| 행잉 | …/sports/hang/ | 행잉 | 타이머 |
| 로잉머신 | …/sports/rowing/ | 로잉머신 | 방식 선택 → 끝난 뒤 시간·거리(km)·SPM 입력 |
| 현황판 | …/sports/board/ | (읽기만) | 스포츠실 TV용. `Dashboard.gs` → 허브 JSONP `action=dash` |
| 청평 인도어사이클 챌린지 | …/sports/ride/ | (읽기만) | 인도어라이딩 GAS(`gas/ride/`) JSONP `?format=json&callback=` |
| TV 돌려보기 | …/sports/tv/ | — | 현황판 ↔ 인도어라이딩 30초마다 번갈아(`?sec=`), ←/→·F 키 |
| 입퇴실 QR(선택) | …/sports/qr/ | 입퇴실 | QR 한 번 = 입실/퇴실. 기본은 허브에서 입퇴실 |

공용 모드(스포츠실 태블릿): 한 번만 `…/sports/?room=gym` 으로 열면 기억됩니다.

## GAS 프로젝트

| 프로젝트 | 배포 주소(/exec) | 코드 위치 |
|---|---|---|
| 서킷트레이닝(운동 기록·허브) | `AKfycbzZIU-UeiWcXuN47lW4XSSwvD9EgP06NdJYrX5NKDf96oqEnfsqaI0B2B3YrvZ6Yw0eVw` | `gas/circuit/` |
| 인도어라이딩 기록판 (`2026_인도어라이딩` 시트) | `AKfycbwbHFh2YXxqtg5d99KSq32ioD1fMbCXOs9PVDrSCmJwwPq32qHURyBz85zLLIN9iPa8` | `gas/ride/` |
| 옛 입퇴실(통합 완료, 보관용) | `AKfycbzV_zxlkSiqSJ_lvgv3z7WkLuFr-nOtS8pY-JDqWBduKi07cLiiX7acZiFAahxL_DtmEw` | `gas/checkin/` |

- 스프레드시트: `26_청평_스마트스포츠실` (옛 이름 `26_4해_서킷트레이닝`). 이름을 바꿔도 GAS 연결은 그대로입니다.
- GAS 코드를 고치면 **배포 관리 → 수정 → 새 버전**으로 다시 배포해야 같은 주소에 반영됩니다.
- 저장소의 `gas/` 폴더가 원본입니다. 편집기에서 고쳤다면 저장소에도 똑같이 반영합니다.

## 공통 규칙

- **QR 이름표에는 구글 아이디만** 들어 있습니다(@cpe.es.kr 없음). 받는 쪽에서 `@` 앞부분만 비교하거나 `DOMAIN`을 붙입니다.
- **공통 부분은 `gas/circuit/Main.gs`**: 설정(`SQUAT_CONFIG`), 받는 창구(`doPost`), 명단 찾기, 응답(`squatJson_`). 운동별 파일은 저장만 맡습니다.
- **학생 찾기는 `lookupStudent_(ss, email)`** 하나로만 합니다(명단에 아이디·이메일이 섞여 있어도 찾음, 10분 캐시).
- **운동 앱 저장 형식**: `POST { type, token, email, clientId, …기록 }` → GAS `doPost`가 `type`으로 나눔.
  새 운동은 ① `gas/circuit/<운동>.gs` 파일 하나 ② `Main.gs`의 `doPost`에 `if (data.type === '<type>') return save<운동>_(data);` 한 줄 ③ 허브 `index.html`의 `EXERCISES`·`ICON`에 한 줄.
- `clientId`로 같은 측정의 중복 저장을 막습니다(CacheService 6시간).
- 저장 응답을 못 읽어도(리다이렉트 단계) 인터넷이 연결돼 있으면 "전송 완료"로 표시합니다.
- 토큰(`26cp4s_squat`)은 화면 코드에 들어 있어 **비밀이 아닙니다**. 실제 보호는 학교 도메인 확인 + 명단 대조입니다.
- 진짜 비밀값(입퇴실 비밀키 등)은 GAS **스크립트 속성**에 두고 저장소에 올리지 않습니다.
- PWA: 앱마다 `manifest`의 `id`를 폴더별로 다르게(`/sports/<폴더>/`). 캐시하는 `sw.js`는 화면을 고치면 `VERSION`을 올립니다.

## 올리면 안 되는 것

공개 저장소입니다. 학생 이름·아이디·명단, 비밀키, 시트 ID 외의 개인 정보는 커밋하지 않습니다.
진단 함수(`diag…`)의 테스트 아이디는 편집기에서만 채웁니다.

## 지금 진행 중

- 전교생 확장: 명단을 전교생으로, QR 이름표 인쇄를 서킷트레이닝 GAS(`?page=qr`)로 이전
- 대시보드: ① 큰 화면 현황판(`board/`) 완료 ② 다음은 학생 「내 성장」 (설계는 Claude Doc '스마트스포츠실 운동 대시보드 설계')
- 다음 후보: 앱 횟수 정확도 검증
