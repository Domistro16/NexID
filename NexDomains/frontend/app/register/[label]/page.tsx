
import Register from '@/components/register';

export default async function RegisterPage({ params }: { params: Promise<{ label: string }> }) {
    const { label } = await params;
    return (
        <>

            <Register />
        </>
    );
}

