import Image from 'next/image'

export default function LinesLoader() {
  return (
    <div className='flex items-center justify-center h-svh gap-2 w-full mt-4'>
      <Image
        src='/images/bars-scale.svg'
        width={20}
        height={20}
        className='dark:invert'
        alt='...'
      />
    </div>
  )
}