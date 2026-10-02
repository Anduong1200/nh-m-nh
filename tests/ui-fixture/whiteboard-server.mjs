// Test-only transport; actual SQL grants/RLS/RPCs are tested with PostgreSQL.
const actors=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"];
const houseId="33333333-3333-4333-8333-333333333333",sessions=new Map();
export async function handleWhiteboardFixture(request,response,url) {
 if(!url.pathname.startsWith("/api/whiteboard/")) return false;
 const actor=actors[Number(url.searchParams.get("actor")??0)],session=url.searchParams.get("session");
 const send=(value,status=200)=>{response.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});response.end(JSON.stringify(value));};
 if(!actor||!session){send({blocked:true},403);return true;}
 if(!sessions.has(session))sessions.set(session,{snapshot:{houseId,version:0,scene:{schemaVersion:1,library:"excalidraw",libraryVersion:"0.18.1",elements:[]},updatedBy:null,updatedAt:null},ledger:new Map(),lose:false});
 const state=sessions.get(session);
 if(url.pathname.endsWith("/snapshot")){send({context:{accountId:actor,houseId},snapshot:state.snapshot});return true;}
 let body="";for await(const chunk of request)body+=chunk;
 const input=JSON.parse(body);
 if(url.pathname.endsWith("/control")){state.lose=input.lose===true;send({success:true});return true;}
 if(url.pathname.endsWith("/partner")){state.snapshot={houseId,version:state.snapshot.version+1,scene:input.scene,updatedBy:actors.find(id=>id!==actor),updatedAt:new Date().toISOString()};send({success:true});return true;}
 const {operation:op,context}=input;
 if(context.accountId!==actor||context.houseId!==houseId){send({blocked:true},403);return true;}
 let saved=state.ledger.get(op.operationId);
 if(saved&&(saved.receipt.actorId!==actor||saved.request!==JSON.stringify(op))){send({blocked:true},403);return true;}
 if(!saved){
  const conflict=op.expectedVersion!==state.snapshot.version;
  if(!conflict)state.snapshot={houseId,version:state.snapshot.version+1,scene:op.scene,updatedBy:actor,updatedAt:new Date().toISOString()};
  saved={receipt:{operationId:op.operationId,actorId:actor,houseId,outcome:conflict?"conflict":"applied",snapshot:structuredClone(state.snapshot)},request:JSON.stringify(op)};
  state.ledger.set(op.operationId,saved);
 }
 if(state.lose){state.lose=false;send({error:"Lost after commit"},503);return true;}
 send({receipt:saved.receipt});return true;
}
