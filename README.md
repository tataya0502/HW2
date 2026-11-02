# Tacticus 계정 트래커

Warhammer 40,000: Tacticus의 공식 API 키를 입력하면 계정 상태(토큰 개수·재생 시간, 보유 캐릭터)를 보여주는 웹 서비스입니다.
`main`에 push하면 GitHub Actions가 테스트 후 서버에 자동 배포합니다. (비공식 팬 프로젝트)

## 기능
- 토큰(레이드·폭탄 등) 현재/최대 개수, 다음 토큰까지, 가득 찰 때까지 남은 시간 (서버 동기화 시각 기준 추정, 30초마다 갱신)
- 토큰이 가득 차 재생이 낭비되는 경우 표시
- 보유 캐릭터 목록: 진영, 랭크, 레벨, 진행 단계, 랭크업 칸 진행도, 검색
- API 키는 서버에 저장·로그 기록하지 않음. 브라우저 `sessionStorage`에만 보관

## 구조
| 파일 | 역할 |
| --- | --- |
| `app.py` | FastAPI. `POST /api/account`가 `GET /api/v1/player`를 중계 (Tacticus API는 CORS 미지원이라 브라우저 직접 호출 불가) |
| `static/` | HTML/CSS/JS 프론트엔드 |
| `Dockerfile` | 배포용 이미지 |
| `.github/workflows/deploy.yml` | push → 테스트 → SSH 배포 |

토큰은 응답에서 `max`와 `current`/`nextTokenInSeconds`/`regenDelayInSeconds`를 가진 객체를 재귀 탐색해 찾으므로, 새 토큰 종류가 추가되어도 자동으로 표시됩니다.

## 로컬 실행 (Windows PowerShell)
```powershell
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```
브라우저에서 http://127.0.0.1:8000 접속 → https://api.tacticusgame.com/ 에서 발급한 **Player** 권한 키 입력.

## 자동 배포 설정
1. Docker가 설치된 Linux 서버(VM)를 준비하고 80 포트를 엽니다.
2. GitHub 저장소 → Settings → Secrets and variables → Actions에 등록: `SSH_HOST`, `SSH_USER`, `SSH_KEY`(개인키 전체).
3. 코드를 수정하고 `git push origin main` → Actions 탭에서 test → deploy 진행 확인 → `http://서버IP` 접속.

## 알려진 한계
- 토큰 필드의 정확한 JSON 경로는 공식 문서에 직접 접근하지 못해 다른 공개 프로젝트를 참고했습니다. 실제 키로 확인이 필요합니다.
- 플레이어 데이터는 게임 서버에 캐시되어 몇 분 지연될 수 있습니다.
