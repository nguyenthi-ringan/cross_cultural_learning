import { useEffect, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { TrashIcon } from '@radix-ui/react-icons';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import {
  setupPdfjsWorker,
  submitUpdateDocuments,
} from '@/lib/document-loaders';
import { cn } from '@/lib/utils';

import FileDropZone from './file-dropzone';
import { SpinnerIcon, WarningIcon } from './ui/icons';

type Document = {
  id?: string;
  name?: string;
  file?: File;
};

type FormValue = {
  documents: Document[];
};

const formSchema = z.object({
  documents: z.array(
    z.object({
      id: z.string().nullish(),
      name: z.string(),
      file: z.any().nullish(),
    }),
  ),
});

interface ManageDocumentFormProps {
  className?: string;
  initialDocuments: { id: string; name: string }[];
  onUpdateStart: () => void;
  onUpdateEnd: (errorMessage?: string) => void;
}

function ManageDocumentForm(props: ManageDocumentFormProps) {
  const { className, initialDocuments, onUpdateStart, onUpdateEnd } = props;

  const [isUpdating, setUpdating] = useState<boolean>(false);
  const [updateProgressMessage, setUpdateProgressMessage] = useState<
    string | null
  >(null);

  const form = useForm<FormValue>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      documents: initialDocuments,
    },
  });

  useEffect(() => {
    setupPdfjsWorker();
  }, []);

  useEffect(() => {
    setUpdating(false);
    form.reset({
      documents: initialDocuments,
    });
  }, [initialDocuments]);

  const onSubmit = async (data: FormValue) => {
    setUpdating(true);
    onUpdateStart();
    try {
      const documents = data.documents || [];

      const addedDocuments = documents.filter((document) => !!document.file);
      const addedFiles: File[] = addedDocuments.map(
        (document) => document.file!,
      );

      const remainedDocuments = documents.filter(({ id }) => !!id);
      const remainedDocumentIds = remainedDocuments.map(
        ({ id }) => id,
      ) as string[];

      const removedDocuments = initialDocuments.filter(
        ({ id }) => !!id && !remainedDocumentIds.includes(id),
      );
      const removedDocumentIds = removedDocuments.map(({ id }) => id!);

      const isAnyFileChanged = addedFiles.length || removedDocumentIds.length;

      if (!isAnyFileChanged) {
        onUpdateEnd();
        return;
      }

      const updateProgress = submitUpdateDocuments({
        added: addedFiles,
        removed: removedDocumentIds,
      });

      for await (const progressMessage of updateProgress) {
        setUpdateProgressMessage(progressMessage);
      }

      onUpdateEnd();
    } catch (e) {
      const errorMessage = (e as any).message || JSON.stringify(e) || e;
      onUpdateEnd(errorMessage);
    } finally {
      setUpdating(false);
      setUpdateProgressMessage(null);
    }
  };

  return (
    <Form {...form}>
      <form
        className={cn('@container flex w-full min-w-0 flex-col', className)}
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className='w-full flex-1 gap-4 overflow-auto'>
          <FormField<FormValue, 'documents'>
            control={form.control}
            name='documents'
            render={({ field }) => {
              const remainedDocuments = (field.value || []).filter(
                ({ id }) => !!id,
              );
              const remainedDocumentIds = remainedDocuments.map(
                ({ id }) => id,
              ) as string[];
              const removedDocuments = initialDocuments.filter(
                ({ id }) => !!id && !remainedDocumentIds.includes(id),
              );

              return (
                <FormItem>
                  <FormControl>
                    <div className='space-y-2'>
                      <FileDropZone
                        accept='.docx, .pdf'
                        multiple
                        onFileDropped={(newFiles) => {
                          const newDocuments = (newFiles || []).map((file) => ({
                            name: file.name,
                            file: file,
                          }));
                          field.onChange([
                            ...(field.value || []),
                            ...newDocuments,
                          ]);
                        }}
                      >
                        <div className='flex h-32 items-center justify-center rounded-md border-2 border-dashed border-muted-foreground p-4 text-center'>
                          <div className='space-y-1 text-sm text-muted-foreground'>
                            <p>Drag and drop files here</p>
                            <p>or click to select files</p>
                          </div>
                        </div>
                      </FileDropZone>
                      {(field.value || []).map((document, index) => (
                        <div
                          key={index}
                          className='flex items-center justify-between gap-2 rounded-md bg-muted p-2 pl-4'
                        >
                          {!!document.file && (
                            <span className='rounded-full bg-green-500 px-2 py-1 text-xs text-primary-foreground'>
                              ADD
                            </span>
                          )}
                          <div className='min-w-0 flex-1 truncate'>
                            {document.name}
                          </div>
                          <Button
                            className='border border-transparent hover:border-destructive hover:text-destructive'
                            variant='ghost'
                            size='icon'
                            type='button'
                            onClick={() => {
                              field.onChange(
                                (field.value || []).filter(
                                  (_, i) => i !== index,
                                ),
                              );
                            }}
                          >
                            <TrashIcon className='size-4' />
                          </Button>
                        </div>
                      ))}
                      {removedDocuments.map((document) => (
                        <div
                          key={document.id}
                          className='flex items-center justify-between gap-2 rounded-md bg-muted p-2'
                        >
                          <span className='rounded-full bg-destructive px-2 py-1 text-xs text-primary-foreground'>
                            REMOVE
                          </span>
                          <div className='min-w-0 flex-1 truncate'>
                            {document.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Only accept pdf and docx files. Maximum 50MB each.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>

        {isUpdating && (
          <div className='rounded border border-muted-foreground px-2 py-1 text-muted-foreground mt-4'>
            <p>
              <WarningIcon size={16} className='mr-1 inline pb-0.5' />
              <span>
                Processing updates, it might take a while for large files.
                Please do not close this dialog until finished.
              </span>
            </p>
            {!!updateProgressMessage && (
              <p className='mt-2 whitespace-break-spaces font-mono text-sm'>
                {updateProgressMessage}
              </p>
            )}
          </div>
        )}

        <div className='flex flex-row justify-end gap-2 p-4'>
          <Button type='submit' className='gap-2' disabled={isUpdating}>
            {isUpdating ? (
              <>
                <span>Updating</span>
                <SpinnerIcon className='size-4 animate-spin' />
              </>
            ) : (
              <span>Save</span>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default ManageDocumentForm;
