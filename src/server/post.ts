import { reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'Triage board',
    entry: 'default',
    textFallback: {
      text: 'Triage board custom post',
    },
  });
};
