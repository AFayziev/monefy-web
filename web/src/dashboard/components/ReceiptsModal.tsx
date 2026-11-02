import {
  ActionIcon,
  Button,
  Center,
  FileButton,
  Image,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { MAX_RECEIPTS_PER_TRANSACTION } from '@/shared/receipts';
import classes from '../Dashboard.module.css';
import {
  useDeleteReceipt,
  useReceiptImage,
  useReceipts,
  useRefreshReceipts,
  useUploadReceipt,
} from '../receipts';

interface Props {
  /** The transaction whose receipts are shown; null keeps the modal closed. */
  rowKey: string | null;
  title: string;
  onClose: () => void;
}

function Thumbnail({
  id,
  onOpen,
  onDelete,
  deleting,
}: {
  id: string;
  onOpen: (url: string) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { url, loading, failed } = useReceiptImage(id);

  return (
    <div className={classes.receiptThumb}>
      {loading && (
        <Center h="100%">
          <Loader size="sm" />
        </Center>
      )}
      {failed && (
        <Center h="100%">
          <Text fz="xs" c="dimmed">
            Couldn't load
          </Text>
        </Center>
      )}
      {url && (
        <Image
          src={url}
          alt="Receipt"
          h="100%"
          w="100%"
          fit="cover"
          className={classes.receiptImage}
          onClick={() => onOpen(url)}
        />
      )}
      <ActionIcon
        variant="filled"
        color="red"
        size="sm"
        pos="absolute"
        top={6}
        right={6}
        loading={deleting}
        aria-label="Delete receipt"
        onClick={onDelete}
      >
        <IconTrash size={14} />
      </ActionIcon>
    </div>
  );
}

function ReceiptsBody({ rowKey, onClose }: { rowKey: string; onClose: () => void }) {
  const receipts = useReceipts(rowKey);
  const upload = useUploadReceipt(rowKey);
  const remove = useDeleteReceipt(rowKey);
  const refresh = useRefreshReceipts(rowKey);
  const [preview, setPreview] = useState<string | null>(null);
  const items = receipts.data ?? [];
  const slots = MAX_RECEIPTS_PER_TRANSACTION - items.length;

  // Uploads go one after another so the limit check on the server sees each one; the lists
  // refresh once at the end.
  const addFiles = async (files: File[]) => {
    try {
      for (const file of files.slice(0, slots)) {
        await upload.mutateAsync(file);
      }
    } catch {
      // the failure is already toasted
    } finally {
      await refresh();
    }
  };

  if (preview) {
    return (
      <Stack>
        <Image src={preview} alt="Receipt" fit="contain" mah="70vh" />
        <Button variant="light" onClick={() => setPreview(null)}>
          Back
        </Button>
      </Stack>
    );
  }

  return (
    <Stack>
      {receipts.isPending && (
        <Center py="lg">
          <Loader size="sm" />
        </Center>
      )}
      {receipts.isError && (
        <Text c="red" fz="sm">
          Couldn't load receipts.
        </Text>
      )}
      {receipts.isSuccess && items.length === 0 && (
        <Text c="dimmed" fz="sm" ta="center" py="md">
          No receipts yet
        </Text>
      )}
      {items.length > 0 && (
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          {items.map((receipt) => (
            <Thumbnail
              key={receipt.id}
              id={receipt.id}
              onOpen={setPreview}
              onDelete={() => remove.mutate(receipt.id)}
              deleting={remove.isPending && remove.variables === receipt.id}
            />
          ))}
        </SimpleGrid>
      )}
      <FileButton onChange={addFiles} accept="image/*" multiple>
        {(props) => (
          <Button
            {...props}
            leftSection={<IconPhotoPlus size={16} />}
            loading={upload.isPending}
            disabled={slots <= 0 || !receipts.isSuccess}
          >
            Add receipt ({items.length} / {MAX_RECEIPTS_PER_TRANSACTION})
          </Button>
        )}
      </FileButton>
      <Button variant="subtle" color="gray" onClick={onClose}>
        Close
      </Button>
    </Stack>
  );
}

export function ReceiptsModal({ rowKey, title, onClose }: Props) {
  return (
    <Modal opened={rowKey !== null} onClose={onClose} title={title} centered size="lg">
      {rowKey !== null && <ReceiptsBody key={rowKey} rowKey={rowKey} onClose={onClose} />}
    </Modal>
  );
}
