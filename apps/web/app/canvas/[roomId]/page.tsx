import LoadingCanvas from "../../../components/LoadingCanvas";

export default async function CanvasPage({
  params,
}: {
  params: { roomId: number };
}) {
  const roomId = (await params).roomId;
  console.log("roomId -> ", roomId);

  return <LoadingCanvas roomId={roomId} />;
}
