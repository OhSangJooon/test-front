import {useRef, useState} from 'react';
import {
  encodeBearerAuthMetadata,
  encodeCompositeMetadata,
  encodeRoute,
  JsonSerializer,
  IdentitySerializer,
  RSocketClient,
  BufferEncoders,
} from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import {WellKnownMimeType} from 'rsocket-composite-metadata';
import { Buffer } from 'buffer';

// npm install rsocket-composite-metadata 해주기

const transport = new RSocketWebSocketClient(
    { url: 'ws://localhost:7010/rsocket' }, // local 테스트
    // { url: 'wss://queue.pass-dev-aptner.com/rsocket' }, // 개발서버
    BufferEncoders,                         // 두 번째 인자: encoders
);

function App() {
  const [status, setStatus] = useState('대기 중...');
  const [queue, setQueue] = useState([]);
  const [totalWating, setTotalWating] = useState(0);
  const [userId, setUserId] = useState('');
  const [testCount, setTestCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const socketRef = useRef(null);

  // 대기열 진입 시 연결 및 스트림 구독
  const connectQueue = () => {
    if (!userId) {
      alert('사용자 ID를 입력해주세요');
      return;
    }

    const jwtToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTAwMDAwMDAxIiwiaXNzIjoicGFzcy1hdXRoIiwiaWF0IjoxNzQ2MDgxNTI2LCJleHAiOjE3NDYxMjQ3MjYsImFwdG5lci1wYXNzLWF1dGgtbWV0aG9kIjoiTUVNQkVSX0lEIiwiYXB0bmVyLXBhc3MtZG9tYWluIjoiTU9CSUxFIiwiY2xpZW50LWlwIjoiMDowOjA6MDowOjA6MDoxIiwianRpIjoiMTEwMDAwMDAwMSJ9.Zt-1RPFKnOn0yTM2G_QHNTNmsdlfPjUa6f84pJgy60k";
    const route = "queue.status";
    const data = { channel: "golf-ff", facilityId: 10000001 };

    // Bearer 접두사를 포함해서 토큰을 생성
    // const authMetadataBuffer = Buffer.from("Bearer " + jwt, "utf8");
    const authMetadataBuffer = encodeBearerAuthMetadata(jwtToken);  // Buffer 또는 Uint8Array
    const routeMetadataBuffer = encodeRoute(route);

    const compositeMetadata = encodeCompositeMetadata([
      [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer],
      [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, routeMetadataBuffer],
    ]);
    const setupMetadata = encodeCompositeMetadata([[WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer]]);

    // 새로 연결한 RSocketClient 생성
    const client = new RSocketClient({
      transport,
      setup: {
        dataMimeType: 'application/json',
        metadataMimeType: 'message/x.rsocket.composite-metadata.v0',
        keepAlive: 60000,
        lifetime: 180000,
        payload: {
          data: null,
          metadata: setupMetadata
        },
        serializers: {
          data: JsonSerializer,
          metadata: IdentitySerializer,
        },
      },
    });

    client.connect().subscribe({
      onComplete: s => {
        setStatus('✅ RSocket 연결 완료');
        socketRef.current = s;  // 연결된 소켓을 ref에 저장

        s.requestStream({
          data: Buffer.from(JSON.stringify(data)),
          metadata: compositeMetadata,
        }).subscribe({
          onSubscribe: sub => {
            console.log('🔗 스트림 구독 시작', sub);
            sub.request(2147483646); // 최대 요청량
          },
          onNext: payload => {
            console.log('✅ 상태 payload:', payload);
            console.log('✅ 상태 Buffer:', payload.data);
            console.log('================= 파싱 시작 ================= ');
            const payloadData = JSON.parse(payload.data.toString('utf8'));
            console.log('✅ 받은 상태:', payloadData);
            console.log('================= 파싱 종료 ================= ');
            setQueue(prev => [...prev, payloadData]);
          },
          onError: error => {
            console.error('❌ 스트림 에러:', error);
            const errorMsg = JSON.parse(error.source.message);

            socketRef.current.close();
            socketRef.current = null;
            setStatus('❌ 스트림 에러 : ' + errorMsg.detail);
          },
          onComplete: () => {
            setStatus('🎉 입장 가능! 스트림 종료');
          },
        });
      },
      onError: error => {
        console.error('❌ 연결 실패:', error);
        setStatus('🚫 연결 실패');
      },
    });
  };

  const test2 = () => {
    const TEST_USER_COUNT = testCount; // 테스트 수량: 100, 1000, 5000, 10000 등으로 조정 가능
    const WS_URL = 'ws://localhost:7010/rsocket';
    const ROUTE = 'queue.test';
    const CHANNEL = 'golf-first';
    const JWT_TOKEN = 'test';

    const generateUserId = () => '11' + Math.floor(100000 + Math.random() * 900000);
    const getRandomLeaveSeconds = () => Math.floor(Math.random() * (60 - 20 + 1)) + 20; // 최소 20초 ~ 60초

    for (let i = 1; i < TEST_USER_COUNT+1; i++) {
      const userId = generateUserId();
      const leaveAfter = getRandomLeaveSeconds();
      const data = { memberId: userId, channel: CHANNEL, facilityId: "10000001", aptId: "11111001" };

      const authMetadataBuffer = encodeBearerAuthMetadata(JWT_TOKEN);
      const routeMetadataBuffer = encodeRoute(ROUTE);

      const compositeMetadata = encodeCompositeMetadata([
        [WellKnownMimeType.MESSAGE_RSOCKET_ROUTING, routeMetadataBuffer],
      ]);
      const setupMetadata = encodeCompositeMetadata([
        [WellKnownMimeType.MESSAGE_RSOCKET_AUTHENTICATION, authMetadataBuffer],
      ]);

      const client = new RSocketClient({
        transport: new RSocketWebSocketClient({ url: WS_URL }, BufferEncoders),
        setup: {
          dataMimeType: 'application/json',
          metadataMimeType: 'message/x.rsocket.composite-metadata.v0',
          keepAlive: 90000,
          lifetime: 270000,
          payload: {
            data: null,
            metadata: setupMetadata,
          },
          serializers: {
            data: JsonSerializer,
            metadata: IdentitySerializer,
          },
        },
      });

      client.connect().subscribe({
        onComplete: socket => {
          const sub = socket.requestStream({
            data: Buffer.from(JSON.stringify(data)),
            metadata: compositeMetadata,
          });

          sub.subscribe({
            onSubscribe: s => s.request(2147483647),
            onNext: payload => {
              const payloadData = JSON.parse(payload.data.toString('utf8'));
              setQueue(prev => [...prev, payloadData]);
              const totWating = payloadData.totalWaiting;
              setTotalWating(p => totWating);
              console.log(`✅ ${i} 번째 회원 순번 : ${payloadData.position}, 총 대기 인원 : ${totWating}`);
            },
            onError: error => {
              console.error(`❌${i} 번째 회원 ${userId} error:`, error);
              setFailCount(prev => prev + 1);
              socket.close();            // 연결 종료
            },
            onComplete: () => {
              setSuccessCount(prev => prev + 1);
              setTimeout(() => {
                socket.close();
              }, leaveAfter * 1000);
            }
          });
        },
        onError: error => {
          setFailCount(prev => prev + 1);
          console.error(`🚫 connection failed:`, error);
        },
      });
    } // 모든 요청은 거의 동시에 발생
  }

  // 대기열 나가기 시 연결된 소켓을 이용해 exit 요청을 보냄 (호출 예시 - 백엔드 개선 필요)
  const exitQueue = () => {
    if (!socketRef.current) {
      alert('연결이 되어있지 않습니다.');
      return;
    }

    const route = "queue.exit";
    const metadata = String.fromCharCode(route.length) + route;

    socketRef.current.requestResponse({
      data: {
        userId: userId,
        channel: "queue.golf"
      },
      metadata: metadata,
    }).subscribe({
      // onSubscribe: sub => {
      //   console.log('🔗 exit 요청 구독 시작', sub);
      //   sub.request(1);
      // },
      onNext: payload => {
        console.log("✅ 퇴장 응답:", payload.data);
      },
      onError: error => {
        console.error("❌ 퇴장 처리 에러:", error);
      },
      onComplete: () => {
        console.log("🎉 퇴장 요청 완료");
        // 연결 종료
        socketRef.current.close();
        socketRef.current = null;
        setStatus('대기 중...');
      }
    });
  };

  return (
      <div style={{ padding: '2rem' }}>
        <h1>🎯 RSocket 대기열 테스트</h1>
        <div style={{ marginBottom: '1rem' }}>
          <input
              type="text"
              placeholder="사용자 ID 입력"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ marginRight: '0.5rem' }}
          />
          <button onClick={connectQueue}>대기열 진입</button>
          <button onClick={test2}>대기열 테스트</button>
          <button onClick={exitQueue}>대기열 나가기</button>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <input
              type="text"
              placeholder="사용자 ID 입력"
              value={testCount}
              onChange={(e) => setTestCount(Number(e.target.value))}
              style={{ marginRight: '0.5rem' }}
          />
        </div>
        <p>📡 연결 상태: <strong>{status}</strong></p>
        <p>✅ 총 대기 인원: <strong>{totalWating}</strong></p>
        <p>✅ 성공 횟수: <strong>{successCount}</strong></p>
        <p>❌ 실패 횟수: <strong>{failCount}</strong></p>
        <hr />
        <ul>
          {queue.map((q, i) => (
              <li key={i}>순번 {q.position} → {q.status} / 총 대기인원 : {q.totalWaiting}</li>
          ))}
        </ul>
      </div>
  );
}



export default App;