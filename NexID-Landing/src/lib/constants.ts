export interface OnChainCourse {
    id: number | string;
    title: string;
    description: string;
    thumbnailUrl: string;
    category: string;
    level: string;
    duration?: string;
    instructor?: string;
    totalLessons?: number;
    _count?: {
        lessons: number;
    };
}
